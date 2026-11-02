// Erreurs typées du serveur.
//
// Chaque erreur porte un message destiné à l'utilisateur final, rédigé en
// français et sans aucun détail technique sensible (jeton, mot de passe,
// trace d'appel). Le principe central : une panne de l'INPI ne doit jamais
// être présentée comme une absence de résultat.

/** Familles d'accès que l'utilisateur doit activer dans son espace data.inpi.fr. */
export type Acces = 'marques' | 'brevets' | 'modeles' | 'rne';

export const LIBELLES_ACCES: Record<Acces, string> = {
  marques: 'API Propriété industrielle, Marques',
  brevets: 'API Propriété industrielle, Brevets',
  modeles: 'API Propriété industrielle, Dessins & Modèles',
  rne: 'API Registre national des entreprises (RNE)',
};

const PAGE_ACCES = 'https://data.inpi.fr/espace_personnel/acces';

/** Classe de base : toutes les erreurs connues du serveur en dérivent. */
export class ErreurINPI extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

/** Les variables d'environnement d'identification sont absentes. */
export class IdentifiantsManquants extends ErreurINPI {
  constructor() {
    super(
      "Identifiants absents. Renseignez les variables d'environnement INPI_EMAIL et " +
        'INPI_MOT_DE_PASSE (adresse et mot de passe de votre compte data.inpi.fr) dans la ' +
        'configuration de votre client MCP, puis redémarrez-le.',
    );
  }
}

/** L'INPI refuse l'adresse ou le mot de passe. */
export class IdentifiantsInvalides extends ErreurINPI {
  constructor(public readonly service: 'pi' | 'rne') {
    super(
      service === 'pi'
        ? "L'API Propriété industrielle refuse l'adresse ou le mot de passe. Vérifiez " +
            "INPI_EMAIL et INPI_MOT_DE_PASSE. Si vous avez défini un mot de passe distinct " +
            "pour l'API PI sur api-gateway.inpi.fr, renseignez-le dans INPI_PI_MOT_DE_PASSE."
        : "L'API RNE refuse l'adresse ou le mot de passe. Vérifiez INPI_EMAIL et " +
            'INPI_MOT_DE_PASSE, et que l\'accès « API RNE » est bien activé dans votre ' +
            `espace personnel (${PAGE_ACCES}).`,
    );
  }
}

/** Le compte est valide mais l'accès à cette famille de données n'est pas activé. */
export class AccesNonActive extends ErreurINPI {
  constructor(public readonly acces: Acces) {
    super(
      `Accès refusé par l'INPI : l'accès « ${LIBELLES_ACCES[acces]} » n'est pas activé pour ` +
        `votre compte. Activez-le dans votre espace personnel data.inpi.fr (${PAGE_ACCES}), ` +
        "rubrique « Mes accès API / SFTP », puis réessayez (l'activation peut demander " +
        "quelques minutes et l'INPI peut vous envoyer un courriel de confirmation).",
    );
  }
}

/** L'INPI ne répond pas ou répond par une erreur serveur, même après plusieurs essais. */
export class IndisponibiliteINPI extends ErreurINPI {
  constructor(
    public readonly service: string,
    public readonly detail: string,
  ) {
    super(
      `Le service ${service} de l'INPI est momentanément indisponible (${detail}). ` +
        "Il ne s'agit PAS d'une absence de résultat : la requête n'a pas pu aboutir malgré " +
        'plusieurs tentatives. Réessayez dans quelques minutes.',
    );
  }
}

/** Le quota d'appels fixé par l'INPI est dépassé. */
export class QuotaDepasse extends ErreurINPI {
  constructor(service: string) {
    super(
      `L'INPI indique que le quota d'appels de votre compte pour le service ${service} est épuisé ` +
        '(code 429). Ce n\'est PAS une absence de résultat. ' +
        (service === 'API RNE'
          ? "Le quota de l'API RNE est de 10 000 appels ou 10 000 Mo par jour : réessayez demain."
          : "L'INPI ne publie ni la valeur de ce quota ni sa durée : patientez avant de réessayer."),
    );
  }
}

/** La ressource demandée (marque, entreprise, document…) n'existe pas. */
export class Introuvable extends ErreurINPI {}

/** Un paramètre fourni par l'utilisateur est invalide ou refusé par l'INPI. */
export class ParametreInvalide extends ErreurINPI {}
