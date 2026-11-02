// Analyse d'une notice de brevet (format XML WIPO ST.36) diffusée par l'INPI
// pour les demandes françaises (FR), européennes (EP), internationales (WO)
// et les certificats complémentaires de protection (CCP).
//
// La structure ST.36 varie selon l'office d'origine : les éléments sont donc
// recherchés à toute profondeur plutôt que par un chemin fixe.

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

export interface EvenementBrevet {
  date?: string;
  libelle: string;
  details: string[];
}

export interface FicheBrevet {
  reference: string;
  titre?: string;
  titresAutresLangues: string[];
  abrege?: string;
  publication: ReferenceDocument;
  depot: ReferenceDocument;
  dateDelivrance?: string;
  statut?: string;
  priorites: ReferenceDocument[];
  classificationsCIB: string[];
  classificationsCPC: string[];
  deposants: PersonneBrevet[];
  titulaires: PersonneBrevet[];
  inventeurs: PersonneBrevet[];
  mandataires: PersonneBrevet[];
  etatsDesignes: string[];
  evenements: EvenementBrevet[];
}

function lireReference(n: unknown): ReferenceDocument {
  const id = chercher(n, 'document-id') ?? n;
  return {
    pays: texteDe(id, 'country'),
    numero: texteDe(id, 'doc-number'),
    code: texteDe(id, 'kind'),
    date: texteDe(id, 'date'),
  };
}

/** Lit une partie (déposant, inventeur, mandataire) au format ST.36. */
function lirePartie(n: unknown): PersonneBrevet | undefined {
  const carnet = chercher(n, 'addressbook') ?? n;
  const organisation = espaces(texteDe(carnet, 'orgname'));
  const nom = espaces(texteDe(carnet, 'last-name'));
  const prenom = espaces(texteDe(carnet, 'first-name'));
  const nomLibre = espaces(texteDe(carnet, 'name'));
  const complet = organisation ?? ([prenom, nom].filter(Boolean).join(' ') || nomLibre);
  if (!complet) return undefined;
  const adresseNoeud = sous(carnet, 'address');
  const pays = texteDe(adresseNoeud, 'country') ?? texteDe(n, 'residence.country');
  const adresse = adresseNoeud
    ? [
        espaces(texteDe(adresseNoeud, 'street') ?? texteDe(adresseNoeud, 'address-1')),
        [texteDe(adresseNoeud, 'postcode'), espaces(texteDe(adresseNoeud, 'city'))].filter(Boolean).join(' '),
      ]
        .filter(Boolean)
        .join(', ') || undefined
    : undefined;
  const identifiant = espaces(texteDe(carnet, 'registered-number') ?? texteDe(carnet, 'iid') ?? texteDe(n, 'siren'));
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

/** Classification CIB lisible : texte fourni ou reconstitution section/classe/sous-classe/groupe. */
function lireClassification(c: unknown): string | undefined {
  const brut = espaces(texteDe(c, 'text'));
  if (brut) return brut;
  const parties = ['section', 'class', 'subclass', 'main-group', 'subgroup'].map((k) => texteDe(c, k));
  if (!parties[0]) return espaces(texte(c));
  return `${parties[0]}${parties[1] ?? ''}${parties[2] ?? ''} ${parties[3] ?? ''}${parties[4] ? `/${parties[4]}` : ''}`.trim();
}

export function analyserNoticeBrevet(xml: string, referenceDemandee = ''): FicheBrevet {
  const racine = analyserXML(xml);
  if (!Object.keys(racine).some((k) => !k.startsWith('?'))) throw new Error('Notice de brevet illisible');

  const titres = chercherTous(racine, 'invention-title');
  const titreFr = titres.find((t) => attribut(t, 'lang')?.toLowerCase() === 'fr') ?? titres[0];
  const abreges = chercherTous(racine, 'abstract');
  const abregeFr = abreges.find((a) => attribut(a, 'lang')?.toLowerCase() === 'fr') ?? abreges[0];

  const publication = lireReference(chercher(racine, 'publication-reference'));
  const depot = lireReference(chercher(racine, 'application-reference'));
  const document = Object.values(racine).find((v) => v && typeof v === 'object') as Noeud | undefined;
  publication.pays ??= attribut(document, 'country');
  publication.numero ??= attribut(document, 'doc-number');
  publication.code ??= attribut(document, 'kind');
  publication.date ??= attribut(document, 'date-publ');

  const cib = [
    ...chercherTous(racine, 'classification-ipcr').map(lireClassification),
    ...chercherTous(racine, 'classification-ipc').map((c) => espaces(texteDe(c, 'main-classification')) ?? lireClassification(c)),
  ].filter((c): c is string => Boolean(c));
  const cpc = chercherTous(racine, 'patent-classification', 'classification-cpc')
    .map(lireClassification)
    .filter((c): c is string => Boolean(c));

  const deposants = lireParties(racine, 'applicant');
  const titulaires = lireParties(racine, 'assignee', 'fr-owner', 'owner');

  // Événements de procédure et inscriptions au Registre national des brevets, lorsque la notice les contient.
  const evenements: EvenementBrevet[] = chercherTous(racine, 'event', 'fr-event', 'legal-event', 'fr-inscription', 'inscription')
    .map((e) => ({
      date: texteDe(e, 'date') ?? attribut(e, 'date'),
      libelle:
        espaces(texteDe(e, 'event-title') ?? texteDe(e, 'title') ?? texteDe(e, 'code') ?? attribut(e, 'code')) ??
        'Événement',
      details: liste(e && typeof e === 'object' ? Object.entries(e as Noeud) : [])
        .map((paire) => paire as [string, unknown])
        .filter(([k]) => !k.startsWith('@') && !['date', 'event-title', 'title', 'code'].includes(k))
        .map(([k, v]) => `${k} : ${texteComplet(v) ?? ''}`)
        .filter((d) => !d.endsWith(': ')),
    }));

  const pays = publication.pays ?? referenceDemandee.slice(0, 2);
  return {
    reference: referenceDemandee || `${pays ?? ''}${publication.numero ?? ''}`,
    titre: espaces(texteComplet(titreFr)),
    titresAutresLangues: titres
      .filter((t) => t !== titreFr)
      .map((t) => `${attribut(t, 'lang') ?? '?'} : ${espaces(texteComplet(t)) ?? ''}`),
    abrege: texteComplet(abregeFr),
    publication,
    depot,
    dateDelivrance: texte(chercher(racine, 'date-of-grant', 'fr-date-of-grant', 'grant-date')) ??
      texteDe(chercher(racine, 'publication-of-grant-date'), 'date'),
    statut: espaces(texte(chercher(racine, 'fr-status', 'status', 'legal-status'))) ?? attribut(document, 'status'),
    priorites: chercherTous(racine, 'priority-claim').map(lireReference),
    classificationsCIB: [...new Set(cib)],
    classificationsCPC: [...new Set(cpc)],
    deposants,
    titulaires,
    inventeurs: lireParties(racine, 'inventor'),
    mandataires: lireParties(racine, 'agent', 'representative'),
    etatsDesignes: chercherTous(racine, 'designation-epc', 'designation-pct', 'designated-states')
      .flatMap((d) => chercherTous(d, 'country').map(texte))
      .filter((c): c is string => Boolean(c)),
    evenements,
  };
}
