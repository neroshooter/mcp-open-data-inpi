// Analyse d'une notice de brevet diffusée par l'INPI (élément racine
// fr-patent-document, dérivé de la norme WIPO ST.36) pour les demandes
// françaises (FR), européennes (EP), internationales (WO) et les certificats
// complémentaires de protection (CCP).
//
// La notice comporte deux parties :
//   - fr-bibliographic-data : références, titre, parties, classifications, priorités ;
//   - fr-patent-life : inscriptions au Registre national des brevets, citations,
//     annuités, délivrance, rejet, déchéance et statut.
// Les éléments sont recherchés à toute profondeur, avec les variantes ST.36
// sans préfixe « fr- », pour tolérer les écarts d'un office à l'autre.

import { analyserXML, attribut, chercher, chercherTous, espaces, liste, sous, texte, texteComplet, texteDe, type Noeud } from './xml.js';

export interface PersonneBrevet {
  nom: string;
  siren?: string;
  adresse?: string;
  pays?: string;
}

export interface ReferenceDocument {
  pays?: string;
  numero?: string;
  code?: string;
  date?: string;
}

export interface InscriptionBrevet {
  numero?: string;
  date?: string;
  nature: string;
  code?: string;
  bopi?: string;
}

export interface DateProcedure {
  libelle: string;
  date?: string;
  bopi?: string;
  precision?: string;
}

export interface FicheBrevet {
  reference: string;
  titre?: string;
  titresAutresLangues: string[];
  abrege?: string;
  langueAbrege?: string;
  nature?: string;
  famille?: string;
  publication: ReferenceDocument & { bopi?: string };
  depot: ReferenceDocument;
  langueDepot?: string;
  statut?: string;
  statutOEB?: string;
  priorites: ReferenceDocument[];
  classificationsCIB: string[];
  classificationsCPC: string[];
  deposants: PersonneBrevet[];
  titulaires: PersonneBrevet[];
  inventeurs: PersonneBrevet[];
  mandataires: PersonneBrevet[];
  etatsDesignes: string[];
  inscriptions: InscriptionBrevet[];
  datesProcedure: DateProcedure[];
  citations: string[];
  mentions: string[];
}

/** Libellés des dates de procédure (fr-date-availability). */
const DATES: Record<string, string> = {
  'fr-date-granted': 'Délivrance',
  'fr-date-search-completed': 'Publication du rapport de recherche',
  'fr-date-application-refused': 'Rejet de la demande',
  'fr-date-application-withdrawn': 'Retrait de la demande',
  'fr-date-lapsed': 'Déchéance',
  'fr-date-notification-lapsed': 'Publication de la déchéance',
  'fr-date-restoration': 'Restauration',
  'fr-date-expired': 'Expiration',
};

/** Référence (pays, numéro, code, date) à partir d'un élément contenant un document-id. */
function lireReference(n: unknown): ReferenceDocument {
  const id = chercher(n, 'document-id') ?? n;
  return {
    pays: texteDe(id, 'country'),
    numero: texteDe(id, 'doc-number'),
    code: texteDe(id, 'kind'),
    date: texteDe(id, 'date'),
  };
}

/** Choisit la référence au format INPI lorsqu'il existe plusieurs formats (inpi, docdb…). */
function referenceINPI(racine: unknown, ...noms: string[]): { noeud: unknown; ref: ReferenceDocument } {
  const candidats = chercherTous(racine, ...noms);
  const noeud = candidats.find((c) => attribut(c, 'data-format') === 'inpi') ?? candidats[0];
  return { noeud, ref: lireReference(noeud) };
}

/** Lit une partie (déposant, titulaire, inventeur, mandataire). L'élément iid porte le SIREN. */
function lirePartie(n: unknown): PersonneBrevet | undefined {
  const carnet = chercher(n, 'addressbook') ?? n;
  const organisation = espaces(texteDe(carnet, 'orgname'));
  const nom = espaces(texteDe(carnet, 'last-name'));
  const prenom = espaces(texteDe(carnet, 'first-name'));
  const complet = organisation ?? ([prenom, nom].filter(Boolean).join(' ') || espaces(texteDe(carnet, 'name')));
  if (!complet) return undefined;
  const a = sous(carnet, 'address');
  const pays = texteDe(a, 'country');
  const adresse =
    [
      espaces(texteDe(a, 'address-1') ?? texteDe(a, 'street')),
      [texteDe(a, 'postcode'), espaces(texteDe(a, 'city'))].filter(Boolean).join(' '),
    ]
      .filter(Boolean)
      .join(', ') || undefined;
  const identifiant = espaces(texteDe(carnet, 'iid') ?? texteDe(carnet, 'registered-number'));
  return {
    nom: complet,
    ...(identifiant && /^\d{9}$/.test(identifiant) ? { siren: identifiant } : {}),
    ...(adresse ? { adresse } : {}),
    ...(pays ? { pays } : {}),
  };
}

function lireParties(racine: unknown, ...noms: string[]): PersonneBrevet[] {
  return chercherTous(racine, ...noms)
    .map(lirePartie)
    .filter((p): p is PersonneBrevet => p !== undefined);
}

/**
 * Rend lisible un code de classification : « B60J   7/08  20060101AFI20110829BHFR »
 * devient « B60J 7/08 ».
 */
export function classificationLisible(brut: string | undefined): string | undefined {
  if (!brut) return undefined;
  const m = /^\s*([A-HY]\d{2}[A-Z])\s*(\d+\s*\/\s*\d+)?/.exec(brut);
  if (!m) return espaces(brut);
  return m[2] ? `${m[1]} ${m[2].replace(/\s/g, '')}` : m[1];
}

export function analyserNoticeBrevet(xml: string, referenceDemandee = ''): FicheBrevet {
  const racine = analyserXML(xml);
  const document = Object.entries(racine).find(([k]) => !k.startsWith('?'))?.[1] as Noeud | undefined;
  if (!document || typeof document !== 'object') throw new Error('Notice de brevet illisible');

  const titres = chercherTous(racine, 'invention-title');
  const titreFr = titres.find((t) => attribut(t, 'lang')?.toLowerCase() === 'fr') ?? titres[0];
  const abreges = chercherTous(racine, 'abstract');
  const abregeFr = abreges.find((a) => attribut(a, 'lang')?.toLowerCase() === 'fr') ?? abreges[0];

  const pub = referenceINPI(racine, 'fr-publication-reference', 'publication-reference');
  const depot = referenceINPI(racine, 'fr-application-reference', 'application-reference').ref;
  const publication = {
    ...pub.ref,
    pays: pub.ref.pays ?? attribut(document, 'country'),
    numero: pub.ref.numero ?? attribut(document, 'doc-number'),
    code: pub.ref.code ?? attribut(document, 'kind'),
    date: pub.ref.date ?? attribut(document, 'date-publ'),
    bopi: texteDe(pub.noeud, 'fr-bopinum'),
  };

  const cib = chercherTous(racine, 'classification-ipcr').map((c) => classificationLisible(texteDe(c, 'text') ?? texte(c)));
  const cpc = chercherTous(racine, 'patent-classification').map((c) =>
    classificationLisible(texteDe(c, 'classification-symbol') ?? texteDe(c, 'text')),
  );

  const vie = chercher(racine, 'fr-patent-life');
  const inscriptions: InscriptionBrevet[] = chercherTous(racine, 'fr-inscription').map((i) => ({
    numero: texteDe(i, 'registered-number'),
    date: texteDe(i, 'date'),
    nature: espaces(texteDe(i, 'fr-nature-inscription')) ?? 'Inscription',
    code: texteDe(i, 'fr-code-inscription'),
    bopi: texteDe(i, 'fr-bopinum'),
  }));

  // Dates de procédure : annuités, délivrance, rejet, déchéance…
  const datesProcedure: DateProcedure[] = [];
  const disponibilite = chercher(racine, 'fr-date-availability');
  if (disponibilite && typeof disponibilite === 'object') {
    for (const [cle, valeur] of Object.entries(disponibilite as Noeud)) {
      if (cle.startsWith('@')) continue;
      for (const v of liste(valeur)) {
        const date = texteDe(v, 'date') ?? texteDe(chercher(v, 'document-id'), 'date');
        const bopi = texteDe(v, 'fr-bopinum');
        const annuite = attribut(v, 'percentile');
        const code = texteDe(chercher(v, 'document-id'), 'kind');
        if (!date && !bopi) continue;
        let libelle = DATES[cle] ?? cle.replace(/^fr-/, '').replace(/-/g, ' ');
        if (cle === 'fr-last-fee-payement') libelle = `Dernière annuité payée${annuite ? ` (${annuite}e annuité)` : ''}`;
        if (cle === 'fr-next-fee-payement') libelle = `Prochaine annuité${annuite ? ` (${annuite}e annuité)` : ''}, échéance`;
        datesProcedure.push({ libelle, date, ...(bopi ? { bopi } : {}), ...(code ? { precision: `publication ${code}` } : {}) });
      }
    }
  }

  const pays = publication.pays ?? referenceDemandee.slice(0, 2);
  return {
    reference: referenceDemandee || `${pays ?? ''}${publication.numero ?? ''}`,
    titre: espaces(texteComplet(titreFr)),
    titresAutresLangues: titres
      .filter((t) => t !== titreFr)
      .map((t) => `${attribut(t, 'lang') ?? '?'} : ${espaces(texteComplet(t)) ?? ''}`),
    abrege: texteComplet(abregeFr),
    langueAbrege: attribut(abregeFr, 'lang'),
    nature: espaces(texteDe(pub.noeud, 'fr-nature')),
    famille: attribut(document, 'family-id'),
    publication,
    depot,
    langueDepot: texte(chercher(racine, 'language-of-filing')),
    statut: espaces(texteDe(chercher(vie, 'fr-status'), 'fr-nature')) ?? espaces(texte(chercher(racine, 'legal-status'))),
    statutOEB: espaces(texteDe(chercher(vie, 'epo-register-status'), 'patent_status')),
    priorites: chercherTous(racine, 'fr-priority-claim', 'priority-claim').map(lireReference),
    classificationsCIB: [...new Set(cib.filter((c): c is string => Boolean(c)))],
    classificationsCPC: [...new Set(cpc.filter((c): c is string => Boolean(c)))],
    deposants: lireParties(racine, 'applicant'),
    titulaires: lireParties(racine, 'fr-owner', 'assignee'),
    inventeurs: lireParties(racine, 'inventor'),
    mandataires: lireParties(racine, 'agent'),
    etatsDesignes: chercherTous(racine, 'designation-epc', 'designation-pct')
      .flatMap((d) => chercherTous(d, 'country').map(texte))
      .filter((c): c is string => Boolean(c)),
    inscriptions,
    datesProcedure,
    citations: chercherTous(racine, 'patcit', 'nplcit')
      .map((c) => espaces(texteDe(c, 'text')))
      .filter((c): c is string => Boolean(c)),
    mentions: chercherTous(racine, 'fr-amended-claim')
      .map((m) => espaces(texte(m)))
      .filter((m): m is string => Boolean(m)),
  };
}
