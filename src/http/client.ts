// Client HTTP commun aux deux API de l'INPI.
//
// Il applique la limite de débit, un délai d'expiration, et réessaie avec un
// délai croissant lorsque l'INPI répond par une erreur passagère. Les essais
// de l'INPI ont montré que la recherche de marques renvoie parfois des
// erreurs 405 ou 500 sans raison : elles sont traitées comme des pannes
// temporaires, jamais comme une absence de résultat.

import { request } from 'node:https';
import { IndisponibiliteINPI, QuotaDepasse } from '../erreurs.js';
import { journal } from '../journal.js';
import { Limiteur, pause } from './limiteur.js';

/** Statuts considérés comme une panne passagère justifiant un nouvel essai. */
const STATUTS_PASSAGERS = new Set([405, 408, 500, 502, 503, 504]);

export interface OptionsRequete {
  methode?: 'GET' | 'POST';
  entetes?: Record<string, string>;
  corps?: string;
  /** Nombre total d'essais (par défaut 4). */
  essais?: number;
  /** Délai d'expiration de chaque essai, en millisecondes. */
  delaiMs?: number;
}

/** En-têtes d'une réponse : seules les opérations utiles au serveur. */
export interface EntetesHTTP {
  get(nom: string): string | null;
  getSetCookie(): string[];
  forEach(rappel: (valeur: string, nom: string) => void): void;
}

export interface Reponse {
  statut: number;
  entetes: EntetesHTTP;
  corps: Buffer;
  texte(): string;
}

/** Envoi d'une requête et réception de la réponse brute. */
export type Transport = (
  url: string,
  options: { methode: string; entetes: Record<string, string>; corps?: string; delaiMs: number },
) => Promise<{ statut: number; entetes: EntetesHTTP; corps: Buffer }>;

/**
 * Transport par défaut, fondé sur le module https de Node plutôt que sur fetch.
 * Certains environnements d'exécution (le moteur Node intégré à Claude Desktop,
 * par exemple) peuvent filtrer l'en-tête Cookie ou les cookies reçus avec
 * fetch ; l'API Propriété industrielle exige pourtant ce cookie (jeton XSRF).
 */
export const transportNode: Transport = (url, options) =>
  new Promise((resoudre, rejeter) => {
    const corps = options.corps === undefined ? undefined : Buffer.from(options.corps, 'utf8');
    const req = request(
      url,
      {
        method: options.methode,
        headers: { ...options.entetes, ...(corps ? { 'Content-Length': String(corps.length) } : {}) },
      },
      (res) => {
        const morceaux: Buffer[] = [];
        res.on('data', (m: Buffer) => morceaux.push(m));
        res.on('error', rejeter);
        res.on('end', () => {
          const brut = res.headers;
          const entetes: EntetesHTTP = {
            get: (nom) => {
              const v = brut[nom.toLowerCase()];
              return v === undefined ? null : Array.isArray(v) ? v.join(', ') : String(v);
            },
            getSetCookie: () => brut['set-cookie'] ?? [],
            forEach: (rappel) => {
              for (const [nom, v] of Object.entries(brut)) {
                if (v !== undefined) rappel(Array.isArray(v) ? v.join(', ') : String(v), nom);
              }
            },
          };
          resoudre({ statut: res.statusCode ?? 0, entetes, corps: Buffer.concat(morceaux) });
        });
      },
    );
    req.setTimeout(options.delaiMs, () => {
      const erreur = new Error('délai de réponse dépassé');
      erreur.name = 'TimeoutError';
      req.destroy(erreur);
    });
    req.on('error', rejeter);
    if (corps) req.write(corps);
    req.end();
  });

/** Transport fondé sur une fonction fetch (utilisé par les tests pour simuler l'INPI). */
export function transportFetch(fetchImpl: typeof fetch): Transport {
  return async (url, options) => {
    const r = await fetchImpl(url, {
      method: options.methode,
      headers: options.entetes,
      body: options.corps,
      signal: AbortSignal.timeout(options.delaiMs),
    });
    return { statut: r.status, entetes: r.headers, corps: Buffer.from(await r.arrayBuffer()) };
  };
}

export interface ParametresService {
  /** Nom lisible du service, utilisé dans les messages d'erreur. */
  nom: string;
  /** Intervalle minimal entre deux requêtes, en millisecondes. */
  intervalleMs: number;
  /** Délai de base entre deux essais (doublé à chaque essai). */
  delaiBaseMs?: number;
}

export class ClientHTTP {
  readonly #limiteur: Limiteur;
  readonly #transport: Transport;

  constructor(
    private readonly service: ParametresService,
    fetchImpl?: typeof fetch,
  ) {
    this.#limiteur = new Limiteur(service.intervalleMs);
    this.#transport = fetchImpl ? transportFetch(fetchImpl) : transportNode;
  }

  /**
   * Envoie une requête. Les statuts 2xx et 4xx sont renvoyés à l'appelant,
   * qui les interprète ; les pannes passagères sont réessayées puis
   * converties en IndisponibiliteINPI ; un 429 devient QuotaDepasse.
   */
  async requete(url: string, options: OptionsRequete = {}): Promise<Reponse> {
    const essais = options.essais ?? 4;
    const delaiBase = this.service.delaiBaseMs ?? 1500;
    let derniereCause = '';

    for (let essai = 1; essai <= essais; essai++) {
      await this.#limiteur.attendre();
      try {
        const r = await this.#transport(url, {
          methode: options.methode ?? 'GET',
          entetes: { 'User-Agent': 'mcp-open-data-inpi', ...options.entetes },
          corps: options.corps,
          delaiMs: options.delaiMs ?? 45_000,
        });
        const corps = r.corps;
        if (r.statut === 429) throw new QuotaDepasse(this.service.nom);
        if (!STATUTS_PASSAGERS.has(r.statut)) {
          return { statut: r.statut, entetes: r.entetes, corps, texte: () => corps.toString('utf8') };
        }
        derniereCause = `erreur HTTP ${r.statut}`;
      } catch (e) {
        if (e instanceof QuotaDepasse) throw e;
        derniereCause =
          e instanceof Error && (e.name === 'TimeoutError' || e.name === 'AbortError')
            ? 'délai de réponse dépassé'
            : 'connexion impossible';
      }
      journal.info(`${this.service.nom} : ${derniereCause}, essai ${essai}/${essais} (${cheminSeul(url)})`);
      if (essai < essais) await pause(delaiBase * 2 ** (essai - 1));
    }
    throw new IndisponibiliteINPI(this.service.nom, `${derniereCause} après ${essais} essais`);
  }
}

/** Ne conserve que le chemin d'une URL, pour un journal lisible et sans paramètre. */
function cheminSeul(url: string): string {
  try {
    return new URL(url).pathname;
  } catch {
    return url;
  }
}

/** Décode la charge utile d'un jeton JWT, sans en vérifier la signature. */
export function lireJWT(jeton: string): Record<string, unknown> | undefined {
  const parties = jeton.split('.');
  if (parties.length !== 3 || !parties[1]) return undefined;
  try {
    return JSON.parse(Buffer.from(parties[1], 'base64url').toString('utf8')) as Record<string, unknown>;
  } catch {
    return undefined;
  }
}
