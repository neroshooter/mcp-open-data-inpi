// Client HTTP commun aux deux API de l'INPI.
//
// Il applique la limite de débit, un délai d'expiration, et réessaie avec un
// délai croissant lorsque l'INPI répond par une erreur passagère. Les essais
// de l'INPI ont montré que la recherche de marques renvoie parfois des
// erreurs 405 ou 500 sans raison : elles sont traitées comme des pannes
// temporaires, jamais comme une absence de résultat.

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

export interface Reponse {
  statut: number;
  entetes: Headers;
  corps: Buffer;
  texte(): string;
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

  constructor(
    private readonly service: ParametresService,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {
    this.#limiteur = new Limiteur(service.intervalleMs);
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
        const r = await this.fetchImpl(url, {
          method: options.methode ?? 'GET',
          headers: options.entetes,
          body: options.corps,
          redirect: 'follow',
          signal: AbortSignal.timeout(options.delaiMs ?? 45_000),
        });
        const corps = Buffer.from(await r.arrayBuffer());
        if (r.status === 429) throw new QuotaDepasse(this.service.nom);
        if (!STATUTS_PASSAGERS.has(r.status)) {
          return { statut: r.status, entetes: r.headers, corps, texte: () => corps.toString('utf8') };
        }
        derniereCause = `erreur HTTP ${r.status}`;
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
