// Analyse d'une notice de dessin ou modèle (format XML WIPO ST.86) diffusée
// par l'INPI pour les dépôts français (FR) et internationaux (WO).
//
// Un dépôt peut contenir plusieurs dessins ou modèles (FR985496-001, -002…),
// chacun avec ses reproductions. Comme pour les brevets, les éléments sont
// recherchés à toute profondeur, la structure variant selon l'office.

import { lirePersonne, type Personne } from './personnes.js';
import { analyserXML, attribut, chercher, chercherTous, espaces, liste, sous, texte, texteDe, type Noeud } from './xml.js';

export interface ModeleUnitaire {
  numero?: string;
  titre?: string;
  produits: string[];
  classesLocarno: string[];
  nombreReproductions?: number;
  statut?: string;
}

export interface InscriptionModele {
  nature: string;
  date?: string;
  reference?: string;
  publication?: string;
  beneficiaires: Personne[];
}

export interface FicheModele {
  reference: string;
  office?: string;
  numeroDepot?: string;
  dateDepot?: string;
  dateEnregistrement?: string;
  datePublication?: string;
  dateExpiration?: string;
  statut?: string;
  ajournement?: string;
  modeles: ModeleUnitaire[];
  deposants: Personne[];
  titulaires: Personne[];
  createurs: Personne[];
  mandataires: Personne[];
  priorites: Array<{ pays?: string; numero?: string; date?: string }>;
  publications: Array<{ numero?: string; date?: string }>;
  inscriptions: InscriptionModele[];
}

function texteFr(noeuds: unknown[]): string | undefined {
  const fr = noeuds.find((n) => attribut(n, 'languageCode') === 'fr') ?? noeuds[0];
  return espaces(texte(fr));
}

function personnes(racine: unknown, ...noms: string[]): Personne[] {
  return chercherTous(racine, ...noms)
    .map(lirePersonne)
    .filter((p): p is Personne => p !== undefined);
}

export function analyserNoticeModele(xml: string, referenceDemandee = ''): FicheModele {
  const racine = analyserXML(xml);
  const premier = Object.entries(racine).find(([k]) => !k.startsWith('?'))?.[1];
  if (!premier) throw new Error('Notice de dessin ou modèle illisible');

  const modeles: ModeleUnitaire[] = chercherTous(racine, 'Design').map((d) => {
    const vues = texte(chercher(d, 'TotalRepresentationSheet', 'ViewNumber', 'DesignRepresentationSheetNumber'));
    return {
      numero: texte(chercher(d, 'DesignIdentifier', 'DesignReference')),
      titre: texteFr(chercherTous(d, 'DesignTitle')),
      produits: chercherTous(d, 'IndicationProduct', 'ProductDescription')
        .map((p) => espaces(texte(p)))
        .filter((p): p is string => Boolean(p)),
      classesLocarno: [
        ...new Set(
          chercherTous(d, 'ClassNumber')
            .map(texte)
            .filter((c): c is string => Boolean(c)),
        ),
      ],
      nombreReproductions: vues && /^\d+$/.test(vues) ? Number(vues) : undefined,
      statut: espaces(texte(chercher(d, 'DesignCurrentStatusCode'))),
    };
  });

  const inscriptions: InscriptionModele[] = chercherTous(racine, 'DesignRecord').flatMap((r) =>
    Object.entries((r ?? {}) as Noeud)
      .filter(([k]) => !k.startsWith('@'))
      .flatMap(([, v]) => liste(v))
      .map((b) => ({
        nature: espaces(texteDe(b, 'RecordIdentifier') ?? texteDe(b, 'BasicRecordKind')) ?? 'Inscription',
        date: texteDe(b, 'RecordFilingDate') ?? texteDe(b, 'RecordEffectiveDate'),
        reference: texteDe(b, 'RecordReference'),
        publication: [
          texteDe(sous(b, 'RecordPublicationDetails.RecordPublication'), 'PublicationIdentifier'),
          texteDe(sous(b, 'RecordPublicationDetails.RecordPublication'), 'PublicationDate'),
        ]
          .filter(Boolean)
          .join(' du ') || undefined,
        beneficiaires: personnes(b, 'Claimant'),
      })),
  );

  return {
    reference: referenceDemandee,
    office: texte(chercher(racine, 'RegistrationOfficeCode')),
    numeroDepot: texte(chercher(racine, 'DesignApplicationNumber', 'ApplicationNumber')),
    dateDepot: texte(chercher(racine, 'DesignApplicationDate', 'ApplicationDate')),
    dateEnregistrement: texte(chercher(racine, 'RegistrationDate')),
    datePublication: texte(chercher(racine, 'PublicationDate')),
    dateExpiration: texte(chercher(racine, 'ExpiryDate')),
    statut: espaces(texte(chercher(racine, 'DesignApplicationCurrentStatusCode', 'DesignCurrentStatusCode', 'MarkCurrentStatusCode'))),
    ajournement: espaces(texte(chercher(racine, 'DeferredPublicationIndicator', 'PublicationDeferment', 'DefermentPeriod'))),
    modeles,
    deposants: personnes(racine, 'Applicant'),
    titulaires: personnes(racine, 'Holder', 'fr-CurrentHolder'),
    createurs: personnes(racine, 'Designer'),
    mandataires: personnes(racine, 'Representative'),
    priorites: chercherTous(racine, 'Priority').map((p) => ({
      pays: texteDe(p, 'PriorityCountryCode'),
      numero: texteDe(p, 'PriorityNumber'),
      date: texteDe(p, 'PriorityDate'),
    })),
    publications: chercherTous(racine, 'Publication').map((p) => ({
      numero: texteDe(p, 'PublicationIdentifier'),
      date: texteDe(p, 'PublicationDate'),
    })),
    inscriptions,
  };
}
