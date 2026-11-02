// Lecture de la configuration depuis les variables d'environnement.
//
// Les identifiants sont conservés dans des champs privés (#) : ils ne
// peuvent pas apparaître par inadvertance dans un JSON.stringify, un
// console.log ou une trace d'erreur. Ils ne sont jamais écrits sur le disque.

import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { IdentifiantsManquants } from './erreurs.js';
import { enregistrerSecret } from './journal.js';

export class Configuration {
  readonly #email: string | undefined;
  readonly #motDePasse: string | undefined;
  readonly #motDePassePI: string | undefined;

  /** Dossier où sont enregistrés les PDF téléchargés depuis le RNE. */
  readonly dossierTelechargements: string;

  /** Variables reçues sous forme de modèle « ${…} » non remplacé, donc ignorées (noms seulement). */
  readonly modelesIgnores: string[];

  constructor(env: NodeJS.ProcessEnv = process.env) {
    this.modelesIgnores = ['INPI_EMAIL', 'INPI_MOT_DE_PASSE', 'INPI_PI_MOT_DE_PASSE', 'INPI_DOSSIER_TELECHARGEMENTS'].filter(
      (nom) => /\$\{[^}]*\}/.test(developperChemin(env[nom]) ?? ''),
    );
    this.#email = nettoyer(env.INPI_EMAIL);
    this.#motDePasse = nettoyer(env.INPI_MOT_DE_PASSE);
    this.#motDePassePI = nettoyer(env.INPI_PI_MOT_DE_PASSE);
    for (const secret of [this.#email, this.#motDePasse, this.#motDePassePI]) {
      if (secret) enregistrerSecret(secret);
    }
    const dossier = nettoyer(developperChemin(env.INPI_DOSSIER_TELECHARGEMENTS));
    this.dossierTelechargements = dossier
      ? resolve(dossier.replace(/^~(?=$|[/\\])/, homedir()))
      : join(homedir(), 'Downloads', 'mcp-open-data-inpi');
  }

  /** Indique si l'adresse et le mot de passe sont renseignés. */
  get identifiantsPresents(): boolean {
    return Boolean(this.#email && this.#motDePasse);
  }

  /** Vrai si un mot de passe propre à l'API Propriété industrielle a été fourni. */
  get motDePassePIPropre(): boolean {
    return this.#motDePassePI !== undefined;
  }

  /** Identifiants de l'API Propriété industrielle. */
  identifiantsPI(): { email: string; motDePasse: string } {
    if (!this.#email || !this.#motDePasse) throw new IdentifiantsManquants();
    return { email: this.#email, motDePasse: this.#motDePassePI ?? this.#motDePasse };
  }

  /** Identifiants de l'API RNE. */
  identifiantsRNE(): { email: string; motDePasse: string } {
    if (!this.#email || !this.#motDePasse) throw new IdentifiantsManquants();
    return { email: this.#email, motDePasse: this.#motDePasse };
  }

  toJSON(): Record<string, unknown> {
    return { dossierTelechargements: this.dossierTelechargements, identifiants: '***' };
  }
}

/** Dossiers usuels que le manifeste de l'extension peut désigner par un modèle. */
const DOSSIERS_USUELS: Record<string, () => string> = {
  HOME: () => homedir(),
  DOWNLOADS: () => join(homedir(), 'Downloads'),
  DOCUMENTS: () => join(homedir(), 'Documents'),
  DESKTOP: () => join(homedir(), 'Desktop'),
};

/**
 * Remplace ${HOME}, ${DOWNLOADS}, ${DOCUMENTS} et ${DESKTOP} : Claude Desktop
 * peut transmettre ces modèles sans les avoir remplacés.
 */
function developperChemin(valeur: string | undefined): string | undefined {
  return valeur?.replace(/\$\{(HOME|DOWNLOADS|DOCUMENTS|DESKTOP)\}/g, (_tout, nom: string) => DOSSIERS_USUELS[nom]?.() ?? '');
}

/**
 * Normalise une variable d'environnement. Une valeur restée sous la forme
 * « ${…} » est ignorée : certains clients (extension Claude Desktop) peuvent
 * transmettre tel quel le modèle d'un champ facultatif laissé vide.
 */
function nettoyer(valeur: string | undefined): string | undefined {
  const v = valeur?.trim();
  if (!v || /\$\{[^}]*\}/.test(v)) return undefined;
  return v;
}
