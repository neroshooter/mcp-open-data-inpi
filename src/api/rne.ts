// Accès à l'API du Registre national des entreprises (RNE) de l'INPI.
//
// Authentification : POST /api/sso/login avec l'adresse et le mot de passe
// du compte data.inpi.fr ; la réponse contient un jeton (valable environ une
// heure) transmis ensuite dans l'en-tête Authorization Bearer.

import type { Configuration } from '../config.js';
import {
  AccesNonActive,
  IdentifiantsInvalides,
  IndisponibiliteINPI,
  Introuvable,
  ParametreInvalide,
} from '../erreurs.js';
import { CacheMemoire } from '../http/cache.js';
import { ClientHTTP, lireJWT, type Reponse } from '../http/client.js';
import { journal } from '../journal.js';

export const BASE_RNE = 'https://registre-national-entreprises.inpi.fr';

/** Délai avant une nouvelle tentative de connexion après un refus d'identifiants. */
const DELAI_APRES_REFUS_MS = 60_000;

const MARGE_EXPIRATION_MS = 60_000;

interface Session {
  jeton: string;
  expireA: number;
}

export class ClientRNE {
  readonly #http: ClientHTTP;
  #session: Session | undefined;
  #connexionEnCours: Promise<Session> | undefined;
  /** Dernier refus d'identifiants : on ne retente pas avant un délai, pour ne pas faire bloquer le compte. */
  #refus: { erreur: IdentifiantsInvalides; jusqua: number } | undefined;
  readonly #cache = new CacheMemoire<unknown>(10 * 60_000, 50);

  constructor(
    private readonly config: Configuration,
    fetchImpl?: typeof fetch,
  ) {
    // Le quota de l'INPI est de 10 000 appels par jour : on reste prudent.
    this.#http = new ClientHTTP({ nom: 'API RNE', intervalleMs: 500 }, fetchImpl);
  }

  /** Vérifie que la connexion fonctionne. */
  async tester(): Promise<void> {
    await this.#obtenirSession();
  }

  /** Requête GET renvoyant du JSON, mise en cache pour une courte durée. */
  async json<T>(chemin: string, quoi: string): Promise<{ donnees: T; entetes: Record<string, string> }> {
    return this.#cache.obtenir(`json:${chemin}`, async () => {
      const r = await this.#appeler(chemin, 'application/json', quoi);
      try {
        const entetes: Record<string, string> = {};
        r.entetes.forEach((v, k) => {
          if (k.startsWith('pagination-')) entetes[k] = v;
        });
        return { donnees: JSON.parse(r.texte()) as T, entetes };
      } catch {
        throw new IndisponibiliteINPI('API RNE', 'réponse illisible');
      }
    }) as Promise<{ donnees: T; entetes: Record<string, string> }>;
  }

  /** Requête GET renvoyant un fichier binaire (PDF). Jamais mise en cache. */
  async binaire(chemin: string, quoi: string): Promise<{ contenu: Buffer; type: string | null }> {
    const r = await this.#appeler(chemin, 'application/pdf, application/octet-stream, */*', quoi);
    return { contenu: r.corps, type: r.entetes.get('content-type') };
  }

  async #appeler(chemin: string, accept: string, quoi: string): Promise<Reponse> {
    for (let tentative = 0; tentative < 2; tentative++) {
      const s = await this.#obtenirSession();
      const r = await this.#http.requete(`${BASE_RNE}${chemin}`, {
        entetes: { Authorization: `Bearer ${s.jeton}`, Accept: accept },
        delaiMs: 120_000,
      });
      if (r.statut >= 200 && r.statut < 300) return r;
      if (r.statut === 401 && tentative === 0) {
        this.#session = undefined;
        continue;
      }
      if (r.statut === 401 || r.statut === 403) throw new AccesNonActive('rne');
      if (r.statut === 404) throw new Introuvable(`${quoi} est introuvable dans le RNE.`);
      if (r.statut === 400) {
        throw new ParametreInvalide(`L'API RNE a refusé la requête : ${messageRNE(r.texte())}`);
      }
      throw new IndisponibiliteINPI('API RNE', `erreur HTTP ${r.statut}`);
    }
    throw new AccesNonActive('rne');
  }

  async #obtenirSession(): Promise<Session> {
    if (this.#session && this.#session.expireA - MARGE_EXPIRATION_MS > Date.now()) return this.#session;
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
    const { email, motDePasse } = this.config.identifiantsRNE();
    const r = await this.#http.requete(`${BASE_RNE}/api/sso/login`, {
      methode: 'POST',
      entetes: { 'Content-Type': 'application/json', Accept: 'application/json' },
      corps: JSON.stringify({ username: email, password: motDePasse }),
    });
    if (r.statut === 400 || r.statut === 401 || r.statut === 403) throw new IdentifiantsInvalides('rne', r.statut);
    if (r.statut < 200 || r.statut >= 300) throw new IndisponibiliteINPI('API RNE', `connexion, erreur HTTP ${r.statut}`);
    let jeton: string | undefined;
    try {
      jeton = (JSON.parse(r.texte()) as { token?: string }).token;
    } catch {
      // traité ci-dessous
    }
    if (!jeton) throw new IndisponibiliteINPI('API RNE', 'jeton absent de la réponse de connexion');
    const exp = lireJWT(jeton)?.exp;
    journal.info('API RNE : connexion établie');
    return { jeton, expireA: typeof exp === 'number' ? exp * 1000 : Date.now() + 55 * 60_000 };
  }
}

function messageRNE(texte: string): string {
  try {
    const j = JSON.parse(texte) as { message?: string; detail?: string };
    return j.message ?? j.detail ?? 'requête invalide';
  } catch {
    return 'requête invalide';
  }
}
