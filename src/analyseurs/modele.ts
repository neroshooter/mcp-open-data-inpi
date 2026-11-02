// Analyse d'une notice de dessin ou modèle diffusée par l'INPI (élément
// racine DesignApplication, format WIPO ST.86) pour les dépôts français (FR)
// et internationaux (WO, enregistrés par le Bureau international « IB »).
//
// Un dépôt peut contenir plusieurs modèles ; l'API renvoie la notice d'un
// modèle à la fois (paramètre ref : 001, 002…), avec les données communes au
// dépôt (déposant, mandataire, pays désignés).

import { lirePersonne, type Personne } from './personnes.js';
import { analyserXML, attribut, chercherTous, espaces, liste, sous, texte, texteDe, type Noeud } from './xml.js';

export interface InscriptionModele {
  nature: string;
  date?: string;
  publication?: { numero?: string; date?: string };
  commentaire?: string;
  pays: string[];
  beneficiaires: Personne[];
}

export interface ModeleUnitaire {
  numero?: string;
  numeroEnregistrement?: string;
  titre?: string;
  description?: string;
  classesLocarno: string[];
  nombreReproductions?: number;
  reproductions: string[];
  dateExpiration?: string;
  statut?: string;
  createurs: Personne[];
  inscriptions: InscriptionModele[];
}

export interface FicheModele {
  reference: string;
  office?: string;
  numeroDepot?: string;
  dateDepot?: string;
  lieuDepot?: string;
  nombreModeles?: number;
  depotSousPliScelle?: boolean;
  paysDesignes: string[];
  modeles: ModeleUnitaire[];
  deposants: Personne[];
  mandataires: Array<Personne & { mention?: string }>;
  priorites: Array<{ pays?: string; numero?: string; date?: string }>;
}

const STATUTS: Record<string, string> = {
  Registered: 'Enregistré',
  Expired: 'Expiré',
  Filed: 'Déposé',
  Withdrawn: 'Retiré',
  Refused: 'Refusé',
  Renounced: 'Renoncé',
  Cancelled: 'Annulé',
  Lapsed: 'Déchu',
};

const OFFICES: Record<string, string> = { IB: 'WO' };

/** Texte en français s'il existe, sinon la première version disponible. */
function texteFr(noeuds: unknown[]): string | undefined {
  const fr = noeuds.find((n) => attribut(n, 'languageCode') === 'fr') ?? noeuds[0];
  return espaces(texte(fr));
}

function personnes(racine: unknown, nom: string): Personne[] {
  return chercherTous(racine, nom)
    .map(lirePersonne)
    .filter((p): p is Personne => p !== undefined);
}

function lireInscription(enregistrement: unknown): InscriptionModele[] {
  if (!enregistrement || typeof enregistrement !== 'object') return [];
  return Object.entries(enregistrement as Noeud)
    .filter(([k]) => !k.startsWith('@'))
    .flatMap(([, v]) => liste(v))
    .map((b) => {
      const pub = sous(b, 'RecordPublicationDetails.RecordPublication');
      const publication = { numero: texteDe(pub, 'PublicationIdentifier'), date: texteDe(pub, 'PublicationDate') };
      return {
        nature: espaces(texteDe(b, 'RecordIdentifier') ?? texteDe(b, 'BasicRecordKind')) ?? 'Inscription',
        date: texteDe(b, 'RecordFilingDate') ?? texteDe(b, 'RecordEffectiveDate') ?? texteDe(b, 'RecordCurrentStatusDate'),
        publication: publication.numero || publication.date ? publication : undefined,
        commentaire: espaces(texteDe(b, 'Comment')),
        pays: chercherTous(b, 'RecordDesignatedCountryCode')
          .map(texte)
          .filter((p): p is string => Boolean(p)),
        beneficiaires: personnes(b, 'Claimant'),
      };
    });
}

export function analyserNoticeModele(xml: string, referenceDemandee = ''): FicheModele {
  const racine = analyserXML(xml);
  const depot = Object.entries(racine).find(([k]) => !k.startsWith('?'))?.[1];
  if (!depot || typeof depot !== 'object') throw new Error('Notice de dessin ou modèle illisible');

  const modeles: ModeleUnitaire[] = chercherTous(depot, 'Design').map((d) => {
    const feuilles = texteDe(d, 'TotalRepresentationSheet');
    const statut = espaces(texteDe(d, 'DesignCurrentStatusCode'));
    return {
      numero: texteDe(d, 'DesignReference'),
      numeroEnregistrement: texteDe(d, 'RegistrationNumber'),
      titre: texteFr(liste(sous(d, 'DesignTitle'))),
      description: texteFr(liste(sous(d, 'DesignDescription'))),
      classesLocarno: [
        ...new Set(
          chercherTous(d, 'ClassNumber')
            .map(texte)
            .filter((c): c is string => Boolean(c)),
        ),
      ],
      nombreReproductions: feuilles && /^\d+$/.test(feuilles) ? Number(feuilles) : undefined,
      reproductions: chercherTous(d, 'View')
        .map((v) => espaces(texteDe(v, 'ViewTitle')))
        .filter((v): v is string => Boolean(v)),
      dateExpiration: texteDe(d, 'ExpiryDate'),
      statut: statut ? (STATUTS[statut] ? `${STATUTS[statut]} (${statut})` : statut) : undefined,
      createurs: personnes(d, 'Designer'),
      inscriptions: chercherTous(d, 'DesignRecord').flatMap(lireInscription),
    };
  });

  const office = texteDe(depot, 'RegistrationOfficeCode');
  const nombre = texteDe(depot, 'TotalDesign');
  return {
    reference: referenceDemandee,
    office: office ? (OFFICES[office] ?? office) : undefined,
    numeroDepot: texteDe(depot, 'DesignApplicationNumber'),
    dateDepot: texteDe(depot, 'DesignApplicationDate'),
    lieuDepot: espaces(texteDe(depot, 'FilingPlace')),
    nombreModeles: nombre && /^\d+$/.test(nombre) ? Number(nombre) : undefined,
    depotSousPliScelle: texteDe(depot, 'SealedDepositIndicator') === 'true' ? true : undefined,
    paysDesignes: liste(sous(depot, 'DesignatedCountryDetails.DesignatedCountry'))
      .map((p) => {
        const code = texteDe(p, 'DesignatedCountryCode');
        const base = texteDe(p, 'DesignatedUnderCode');
        return code ? `${code}${base ? ` (${base})` : ''}` : undefined;
      })
      .filter((p): p is string => Boolean(p)),
    modeles,
    deposants: personnes(sous(depot, 'ApplicantDetails'), 'Applicant'),
    mandataires: liste(sous(depot, 'RepresentativeDetails.Representative'))
      .map((r) => {
        const p = lirePersonne(r);
        const mention = espaces(texteDe(r, 'Comment'));
        return p ? { ...p, ...(mention ? { mention } : {}) } : undefined;
      })
      .filter((p): p is Personne & { mention?: string } => p !== undefined),
    priorites: chercherTous(depot, 'Priority').map((p) => ({
      pays: texteDe(p, 'PriorityCountryCode'),
      numero: texteDe(p, 'PriorityNumber'),
      date: texteDe(p, 'PriorityDate'),
    })),
  };
}
