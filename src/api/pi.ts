// Accès à l'API Propriété industrielle de l'INPI (api-gateway.inpi.fr).
//
// Authentification en deux temps :
//   1. GET /services/uaa/api/authenticate renvoie un cookie XSRF-TOKEN ;
//   2. POST /auth/login avec ce jeton renvoie un access_token (valable
//      environ cinq minutes) et des cookies de session.
// Les appels suivants portent l'en-tête Authorization Bearer, l'en-tête
// X-XSRF-TOKEN et l'ensemble des cookies reçus.

import type { Configuration } from '../config.js';
import {
  AccesNonActive,
  IdentifiantsInvalides,
  IndisponibiliteINPI,
  Introuvable,
  ParametreInvalide,
} from '../erreurs.js';
import { CacheMemoire } from '../http/cache.js';
import { ClientHTTP, lireJWT, type EntetesHTTP, type Reponse } from '../http/client.js';
import { journal } from '../journal.js';

export const BASE_PI = 'https://api-gateway.inpi.fr';
const BASE_DIFFUSION = `${BASE_PI}/services/apidiffusion/api`;

/** Familles de titres couvertes par l'API, avec le segment d'URL correspondant. */
export type FamillePI = 'marques' | 'brevets' | 'modeles';

/** Corps d'une requête de recherche, tel que l'attend l'INPI. */
export interface RequeteRecherchePI {
  collections: string[];
  query: string;
  position?: number;
  size?: number;
  sort?: string;
  order?: 'asc' | 'desc';
  fields?: string[];
}

/** Réponse JSON d'une recherche. */
export interface ReponseRecherchePI {
  metadata: { count: number; position: number; size: number };
  results: Array<{
    documentId: string;
    xml?: { href: string };
    self?: { href: string };
    fields: Array<{ name: string; value: string | null; values: string[] | null }>;
  }>;
}

interface Session {
  jeton: string;
  xsrf: string;
  cookies: Map<string, string>;
  expireA: number;
  droits: string[];
}

/** Marge de sécurité avant l'expiration du jeton, en millisecondes. */
/** Délai avant une nouvelle tentative de connexion après un refus d'identifiants. */
const DELAI_APRES_REFUS_MS = 60_000;

const MARGE_EXPIRATION_MS = 30_000;

export class ClientPI {
  readonly #http: ClientHTTP;
  #session: Session | undefined;
  #connexionEnCours: Promise<Session> | undefined;
  /** Dernier refus d'identifiants : on ne retente pas avant un délai, pour ne pas faire bloquer le compte. */
  #refus: { erreur: IdentifiantsInvalides; jusqua: number } | undefined;
  readonly #cache = new CacheMemoire<string>(10 * 60_000);

  constructor(
    private readonly config: Configuration,
    fetchImpl?: typeof fetch,
  ) {
    this.#http = new ClientHTTP({ nom: 'API Propriété industrielle', intervalleMs: 250 }, fetchImpl);
  }

  /** Droits (rôles) portés par le jeton, par exemple ROLE_API_MARQUES. */
  async droits(): Promise<string[]> {
    return (await this.#obtenirSession()).droits;
  }

  /** Lance une recherche et renvoie la réponse JSON de l'INPI. */
  async rechercher(famille: FamillePI, requete: RequeteRecherchePI): Promise<ReponseRecherchePI> {
    const corps = JSON.stringify(requete);
    const texte = await this.#cache.obtenir(`recherche:${famille}:${corps}`, async () => {
      const r = await this.#appeler(famille, `${BASE_DIFFUSION}/${famille}/search`, {
        methode: 'POST',
        corps,
        accept: 'application/json',
      });
      return r.texte();
    });
    try {
      const json = JSON.parse(texte) as ReponseRecherchePI;
      if (!json.metadata || !Array.isArray(json.results)) throw new Error('structure inattendue');
      return json;
    } catch {
      this.#cache.vider();
      throw new IndisponibiliteINPI('API Propriété industrielle', 'réponse de recherche illisible');
    }
  }

  /** Récupère une ressource XML (notice) à partir de son chemin relatif. */
  async xml(famille: FamillePI, chemin: string, quoi: string): Promise<string> {
    return this.#cache.obtenir(`xml:${chemin}`, async () => {
      const r = await this.#appeler(famille, `${BASE_DIFFUSION}/${chemin}`, {
        accept: 'application/xml',
        quoi,
      });
      const texte = r.texte();
      if (!texte.trim()) throw new Introuvable(`${quoi} est introuvable dans la base de l'INPI.`);
      return texte;
    });
  }

  async #appeler(
    famille: FamillePI,
    url: string,
    opts: { methode?: 'GET' | 'POST'; corps?: string; accept: string; quoi?: string },
  ): Promise<Reponse> {
    for (let tentative = 0; tentative < 2; tentative++) {
      const s = await this.#obtenirSession();
      const r = await this.#http.requete(url, {
        methode: opts.methode ?? 'GET',
        corps: opts.corps,
        entetes: {
          Authorization: `Bearer ${s.jeton}`,
          'X-XSRF-TOKEN': s.xsrf,
          Cookie: enteteCookies(s.cookies),
          Accept: opts.accept,
          ...(opts.corps ? { 'Content-Type': 'application/json' } : {}),
        },
      });
      if (r.statut >= 200 && r.statut < 300) return r;
      if (r.statut === 401 && tentative === 0) {
        // Jeton expiré ou révoqué : nouvelle connexion puis nouvel essai.
        this.#session = undefined;
        continue;
      }
      if (r.statut === 401 || r.statut === 403) throw new AccesNonActive(famille);
      if (r.statut === 404) {
        throw new Introuvable(`${opts.quoi ?? 'La ressource demandée'} est introuvable dans la base de l'INPI.`);
      }
      if (r.statut === 400) {
        throw new ParametreInvalide(`L'INPI a refusé la requête : ${messageProbleme(r.texte())}`);
      }
      throw new IndisponibiliteINPI('API Propriété industrielle', `erreur HTTP ${r.statut}`);
    }
    throw new AccesNonActive(famille);
  }

  async #obtenirSession(): Promise<Session> {
    if (this.#session && this.#session.expireA - MARGE_EXPIRATION_MS > Date.now()) return this.#session;
    // Une seule connexion à la fois, même si plusieurs outils sont appelés en parallèle.
    if (this.#refus && this.#refus.jusqua > Date.now()) throw this.#refus.erreur;
    this.#connexionEnCours ??= this.#seConnecter()
      .catch((e: unknown) => {
        if (e instanceof IdentifiantsInvalides) this.#refus = { erreur: e, jusqua: Date.now() + DELAI_APRES_REFUS_MS };
        throw e;
      })
      .finally(() => {
        this.#connexionEnCours = undefined;
      });
    this.#session = await this.#connexionEnCours;
    return this.#session;
  }

  async #seConnecter(): Promise<Session> {
    const { email, motDePasse } = this.config.identifiantsPI();
    const cookies = new Map<string, string>();

    // Étape 1 : obtention du cookie XSRF-TOKEN (la réponse est un 401 attendu).
    const r1 = await this.#http.requete(`${BASE_PI}/services/uaa/api/authenticate`);
    lireCookies(r1.entetes, cookies);
    const xsrf = cookies.get('XSRF-TOKEN');
    if (!xsrf) throw new IndisponibiliteINPI('API Propriété industrielle', 'jeton XSRF absent');

    // Étape 2 : connexion.
    const r2 = await this.#http.requete(`${BASE_PI}/auth/login`, {
      methode: 'POST',
      entetes: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'X-XSRF-TOKEN': xsrf,
        Cookie: enteteCookies(cookies),
      },
      corps: JSON.stringify({ username: email, password: motDePasse, rememberMe: true }),
    });
    if (r2.statut === 400 || r2.statut === 401) throw new IdentifiantsInvalides('pi', r2.statut);
    if (r2.statut === 403) {
      // L'INPI n'a pas reconnu la session : cookie XSRF non transmis ou refusé.
      throw new IndisponibiliteINPI(
        'API Propriété industrielle',
        `connexion refusée par le contrôle de session XSRF (HTTP 403 : ${messageProbleme(r2.texte())})`,
      );
    }
    if (r2.statut < 200 || r2.statut >= 300) {
      throw new IndisponibiliteINPI('API Propriété industrielle', `connexion, erreur HTTP ${r2.statut}`);
    }
    lireCookies(r2.entetes, cookies);
    let corps: { access_token?: string; expires_in?: number } = {};
    try {
      corps = JSON.parse(r2.texte()) as typeof corps;
    } catch {
      // Le jeton peut n'être transmis que par cookie.
    }
    const jeton = corps.access_token ?? cookies.get('access_token');
    if (!jeton) throw new IndisponibiliteINPI('API Propriété industrielle', 'jeton d’accès absent');

    const charge = lireJWT(jeton);
    const exp = typeof charge?.exp === 'number' ? charge.exp * 1000 : Date.now() + (corps.expires_in ?? 300) * 1000;
    const droits = Array.isArray(charge?.authorities) ? (charge.authorities as string[]) : [];
    journal.info(`API PI : connexion établie, droits ${droits.join(', ') || 'inconnus'}`);
    return { jeton, xsrf: cookies.get('XSRF-TOKEN') ?? xsrf, cookies, expireA: exp, droits };
  }
}

function lireCookies(entetes: EntetesHTTP, cookies: Map<string, string>): void {
  for (const ligne of entetes.getSetCookie()) {
    const [paire] = ligne.split(';');
    const i = paire?.indexOf('=') ?? -1;
    if (paire && i > 0) cookies.set(paire.slice(0, i).trim(), paire.slice(i + 1).trim());
  }
}

function enteteCookies(cookies: Map<string, string>): string {
  return [...cookies].map(([k, v]) => `${k}=${v}`).join('; ');
}

/** Extrait le message lisible d'une réponse d'erreur de l'INPI, sans la trace Java. */
export function messageProbleme(texte: string): string {
  try {
    const j = JSON.parse(texte) as { detail?: string; title?: string; message?: string };
    return j.detail ?? j.message ?? j.title ?? 'requête invalide';
  } catch {
    return texte.slice(0, 200) || 'requête invalide';
  }
}
