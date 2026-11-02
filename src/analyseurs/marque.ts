// Analyse d'une notice de marque (format XML WIPO ST.66 diffusé par l'INPI)
// pour les marques françaises (FR), de l'Union européenne (EU) et
// internationales (WO).

import { lirePersonne, lirePersonnes, type Personne } from './personnes.js';
import { analyserXML, attribut, espaces, liste, sous, texte, texteDe, tous, type Noeud } from './xml.js';

export interface ClasseProduits {
  numero: string;
  libelle: string;
}

export interface Publication {
  numero: string;
  date?: string;
  section?: string;
  objet?: string;
}

export interface Priorite {
  pays?: string;
  numero?: string;
  date?: string;
  partielle?: boolean;
}

export interface Inscription {
  /** Nature précise : « Transmission totale de propriété », « Renonciation partielle »… */
  nature: string;
  /** Catégorie INPI : Inscription, Publication, Renouvellement… */
  categorie?: string;
  dateDepot?: string;
  dateEffet?: string;
  reference?: string;
  statut?: string;
  office?: string;
  publications: Publication[];
  beneficiaires: Personne[];
  /** Libellés après limitation, renonciation ou retrait partiel. */
  libellesApresLimitation: ClasseProduits[];
  paysDesignes: string[];
}

export interface FicheMarque {
  office: string;
  numero: string;
  /** Numéro complet préfixé (FR4020655, EU019023157, WO1234567). */
  reference: string;
  nom?: string;
  type?: string;
  nature?: string;
  statut?: string;
  dateStatut?: string;
  dateDepot?: string;
  dateEnregistrement?: string;
  dateExpiration?: string;
  lieuDepot?: string;
  langue?: string;
  description?: string;
  renouvellement?: { debut?: string; fin?: string };
  nombreOppositions?: number;
  classificationNice?: string;
  classes: ClasseProduits[];
  codesVienne: string[];
  deposants: Personne[];
  titulairesActuels: Personne[];
  mandataires: Personne[];
  priorites: Priorite[];
  anciennetes: Priorite[];
  publications: Publication[];
  inscriptions: Inscription[];
  /** Marques internationales : pays désignés et enregistrement de base. */
  paysDesignes: string[];
  enregistrementDeBase?: { numero?: string; date?: string };
  officeOrigine?: string;
}

/** Libellés français des natures de signe (MarkFeature). */
const TYPES: Record<string, string> = {
  Word: 'Verbale',
  Figurative: 'Figurative',
  Combined: 'Semi-figurative (complexe)',
  'Stylized characters': 'Verbale en caractères stylisés',
  '3-D': 'Tridimensionnelle',
  Shape: 'Forme (tridimensionnelle)',
  Colour: 'Couleur',
  Sound: 'Sonore',
  Hologram: 'Hologramme',
  Position: 'Position',
  Pattern: 'Motif',
  Motion: 'Mouvement',
  Multimedia: 'Multimédia',
  Olfactory: 'Olfactive',
  Other: 'Autre',
};

const NATURES: Record<string, string> = {
  Individual: 'Marque individuelle',
  Collective: 'Marque collective',
  Certificate: 'Marque de garantie',
  Guarantee: 'Marque de garantie',
};

/** Traduction des statuts anglais employés pour les marques EU et WO. */
const STATUTS: Record<string, string> = {
  Registered: 'Enregistrée',
  Filed: 'Déposée',
  'Application filed': 'Demande déposée',
  'Application published': 'Demande publiée',
  'Registration pending': 'Enregistrement en cours',
  'Application opposed': 'Demande frappée d’opposition',
  Opposed: 'Frappée d’opposition',
  Expired: 'Expirée',
  'Registration expired': 'Enregistrement expiré',
  Refused: 'Refusée',
  'Application refused': 'Demande refusée',
  Withdrawn: 'Retirée',
  'Application withdrawn': 'Demande retirée',
  Surrendered: 'Renoncée',
  'Registration surrendered': 'Enregistrement abandonné par renonciation',
  Cancelled: 'Annulée',
  'Registration cancelled': 'Enregistrement annulé',
  'Cancellation pending': 'Procédure de nullité ou de déchéance en cours',
  'Appeal pending': 'Recours en cours',
  Appealed: 'Recours en cours',
  Ended: 'Fin de vie',
};

/** Analyse le XML d'une notice de marque. */
export function analyserNoticeMarque(xml: string): FicheMarque {
  const racine = analyserXML(xml);
  const m = racine.TradeMark as Noeud | undefined;
  if (!m) throw new Error('Notice de marque illisible : élément TradeMark absent');

  const office = texteDe(m, 'RegistrationOfficeCode') ?? '';
  const numero = texteDe(m, 'ApplicationNumber') ?? '';
  const featureBrut = texteDe(m, 'MarkFeature');
  const natureBrute = texteDe(m, 'KindMark');
  const statutBrut = espaces(texteDe(m, 'MarkCurrentStatusCode'));
  const opposition = texteDe(m, 'fr-OppositionCount');

  const fiche: FicheMarque = {
    office,
    numero,
    // L'INPI préfixe les marques de l'Union européenne par EU (l'office se déclare EM).
    reference: `${office === 'EM' ? 'EU' : office}${numero}`,
    nom: espaces(texteDe(m, 'WordMarkSpecification.MarkVerbalElementText')),
    type: featureBrut ? (TYPES[featureBrut] ? `${TYPES[featureBrut]}` : featureBrut) : undefined,
    nature: natureBrute ? (NATURES[natureBrute] ?? natureBrute) : undefined,
    statut: statutBrut ? traduireStatut(statutBrut) : undefined,
    dateStatut: texteDe(m, 'MarkCurrentStatusDate'),
    dateDepot: texteDe(m, 'ApplicationDate'),
    dateEnregistrement: texteDe(m, 'RegistrationDate'),
    dateExpiration: texteDe(m, 'ExpiryDate'),
    lieuDepot: espaces(texteDe(m, 'FilingPlace')),
    langue: texteDe(m, 'ApplicationLanguageCode'),
    description: liste(sous(m, 'MarkDescriptionDetails.MarkDescription'))
      .map((d) => espaces(texte(d)))
      .filter(Boolean)
      .join(' ; ') || undefined,
    renouvellement:
      texteDe(m, 'fr-RenewalPeriodStartDate') || texteDe(m, 'fr-RenewalPeriodEndDate')
        ? { debut: texteDe(m, 'fr-RenewalPeriodStartDate'), fin: texteDe(m, 'fr-RenewalPeriodEndDate') }
        : undefined,
    nombreOppositions: opposition !== undefined && /^\d+$/.test(opposition) ? Number(opposition) : undefined,
    classificationNice: texteDe(m, 'GoodsServicesDetails.GoodsServices.ClassificationVersion'),
    classes: lireClasses(tous(m, 'GoodsServicesDetails.GoodsServices.ClassDescriptionDetails.ClassDescription')),
    codesVienne: [
      ...new Set(
        tous(m, 'MarkImageDetails.MarkImage.MarkImageCategory.CategoryCodeDetails.CategoryCode')
          .map(texte)
          .filter((c): c is string => Boolean(c)),
      ),
    ],
    deposants: lirePersonnes(sous(m, 'ApplicantDetails'), 'Applicant'),
    titulairesActuels: [
      ...lirePersonnes(sous(m, 'fr-CurrentHolderDetails'), 'fr-CurrentHolder'),
      ...lirePersonnes(sous(m, 'HolderDetails'), 'Holder'),
    ],
    mandataires: lirePersonnes(sous(m, 'RepresentativeDetails'), 'Representative'),
    priorites: tous(m, 'PriorityDetails.Priority').map((p) => ({
      pays: texteDe(p, 'PriorityCountryCode'),
      numero: texteDe(p, 'PriorityNumber'),
      date: texteDe(p, 'PriorityDate'),
      ...(texteDe(p, 'PriorityPartialIndicator') === 'true' ? { partielle: true } : {}),
    })),
    anciennetes: tous(m, 'SeniorityDetails.Seniority').map((s) => ({
      pays: texteDe(s, 'SeniorityCountryCode'),
      numero: texteDe(s, 'SeniorityRegistrationNumber') ?? texteDe(s, 'SeniorityApplicationNumber'),
      date: texteDe(s, 'SeniorityRegistrationDate') ?? texteDe(s, 'SeniorityFilingDate'),
    })),
    publications: [],
    inscriptions: tous(m, 'MarkRecordDetails.MarkRecord').flatMap(lireInscriptions),
    paysDesignes: lirePaysDesignes(sous(m, 'DesignatedCountryDetails')),
    officeOrigine: texteDe(m, 'ReceivingOfficeCode'),
  };

  const base = sous(m, 'BasicRegistrationApplicationDetails.BasicRegistrationApplication');
  const enregistrementBase = sous(base, 'BasicRegistrationDetails.BasicRegistration');
  const demandeBase = sous(base, 'BasicApplicationDetails.BasicApplication');
  if (enregistrementBase || demandeBase) {
    fiche.enregistrementDeBase = {
      numero: texteDe(enregistrementBase, 'BasicRegistrationNumber') ?? texteDe(demandeBase, 'BasicApplicationNumber'),
      date: texteDe(enregistrementBase, 'BasicRegistrationDate') ?? texteDe(demandeBase, 'BasicApplicationDate'),
    };
  }

  // Publications : bulletin de l'office (EU) et publications au BOPI liées aux inscriptions (FR).
  const publications: Publication[] = tous(m, 'PublicationDetails.Publication').map((p) => ({
    numero: texteDe(p, 'PublicationIdentifier') ?? '',
    date: texteDe(p, 'PublicationDate'),
    section: texteDe(p, 'PublicationSection'),
  }));
  for (const i of fiche.inscriptions) {
    for (const p of i.publications) publications.push({ ...p, objet: i.nature });
  }
  const racinePub = attribut(m, 'PublicationIdentifier');
  if (racinePub && !publications.some((p) => p.date === attribut(m, 'PublicationDate'))) {
    publications.push({ numero: racinePub, date: attribut(m, 'PublicationDate') });
  }
  fiche.publications = dedoublonner(publications.filter((p) => p.numero)).sort(parDate);
  fiche.inscriptions.sort((a, b) => parDate({ date: a.dateDepot ?? a.publications[0]?.date }, { date: b.dateDepot ?? b.publications[0]?.date }));
  return fiche;
}

function traduireStatut(statut: string): string {
  const fr = STATUTS[statut];
  return fr ? `${fr} (${statut})` : statut;
}

/** Libellés de produits et services, en privilégiant la version française. */
function lireClasses(descriptions: unknown[]): ClasseProduits[] {
  return descriptions
    .map((d) => {
      const versions = liste(sous(d, 'GoodsServicesDescription'));
      const choisie =
        versions.find((v) => attribut(v, 'languageCode') === 'fr') ??
        versions.find((v) => attribut(v, 'languageCode') === undefined) ??
        versions.find((v) => attribut(v, 'languageCode') === 'en') ??
        versions[0];
      return { numero: texteDe(d, 'ClassNumber') ?? '', libelle: espaces(texte(choisie)) ?? '' };
    })
    .filter((c) => c.numero || c.libelle);
}

function lirePaysDesignes(conteneur: unknown): string[] {
  return liste(sous(conteneur, 'DesignatedCountry'))
    .map((d) => {
      const code = texteDe(d, 'DesignatedCountryCode');
      const base = texteDe(d, 'DesignatedUnderCode');
      return code ? (base ? `${code} (${base})` : code) : undefined;
    })
    .filter((x): x is string => Boolean(x));
}

/** Une MarkRecord contient un BasicRecord ou un autre type d'inscription (période d'opposition, etc.). */
function lireInscriptions(enregistrement: unknown): Inscription[] {
  if (!enregistrement || typeof enregistrement !== 'object') return [];
  return Object.entries(enregistrement as Noeud)
    .filter(([cle]) => !cle.startsWith('@'))
    .flatMap(([cle, valeur]) => liste(valeur).map((r) => lireInscription(cle, r)));
}

function lireInscription(type: string, r: unknown): Inscription {
  const categorie = espaces(texteDe(r, 'BasicRecordKind'));
  const natureParticuliere = Object.entries((r ?? {}) as Noeud).find(
    ([k]) => k.endsWith('Kind') && k !== 'BasicRecordKind',
  );
  const nature =
    espaces(texteDe(r, 'RecordIdentifier')) ??
    categorie ??
    espaces(texte(natureParticuliere?.[1])) ??
    type;
  const limitations = [
    ...tous(r, 'GoodsServicesLimitationDetails.GoodsServicesLimitation.LimitationClassDescriptionDetails.ClassDescription'),
    ...tous(r, 'GoodsServicesLimitationDetails.GoodsServicesLimitation.ClassDescriptionDetails.ClassDescription'),
  ];
  // Textes libres de limitation (« Admis pour tous les services des classes 35 et 42 »).
  const libellesLibres = tous(r, 'GoodsServicesLimitationDetails.GoodsServicesLimitation')
    .flatMap((l) => {
      const entetes = liste(sous(l, 'GoodsServicesHeader'));
      const entete = entetes.find((e) => attribut(e, 'languageCode') === 'fr') ?? entetes[0];
      return [entete, ...liste(sous(l, 'GoodsServicesLimitationText'))];
    })
    .map((t) => espaces(texte(t)))
    .filter((t): t is string => Boolean(t))
    .map((libelle) => ({ numero: '', libelle }));
  return {
    nature,
    categorie: categorie && categorie !== nature ? categorie : undefined,
    dateDepot: texteDe(r, 'RecordFilingDate'),
    dateEffet: texteDe(r, 'RecordEffectiveDate'),
    reference: texteDe(r, 'RecordReference'),
    statut: texteDe(r, 'RecordCurrentStatusCode'),
    office: texteDe(r, 'RecordInterestedOfficeCode'),
    publications: tous(r, 'RecordPublicationDetails.RecordPublication').map((p) => ({
      numero: texteDe(p, 'PublicationIdentifier') ?? '',
      date: texteDe(p, 'PublicationDate'),
    })),
    beneficiaires: tous(r, 'ClaimantDetails.Claimant')
      .map(lirePersonne)
      .filter((p): p is Personne => p !== undefined),
    libellesApresLimitation: [...lireClasses(limitations), ...libellesLibres],
    paysDesignes: lirePaysDesignes(sous(r, 'RecordDesignatedCountryDetails')),
  };
}

function dedoublonner(publications: Publication[]): Publication[] {
  const vues = new Map<string, Publication>();
  for (const p of publications) {
    const cle = `${p.numero}|${p.date ?? ''}`;
    const existante = vues.get(cle);
    if (!existante) vues.set(cle, p);
    else if (p.objet && !existante.objet) existante.objet = p.objet;
  }
  return [...vues.values()];
}

function parDate(a: { date?: string }, b: { date?: string }): number {
  return (a.date ?? '9999').localeCompare(b.date ?? '9999');
}
