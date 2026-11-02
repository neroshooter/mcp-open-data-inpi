// Lecture de la liste des documents déposés au RNE
// (GET /api/companies/{siren}/attachments) : actes et comptes annuels.

import { TYPES_DOCUMENT } from '../referentiels/rne.js';
import { TYPES_BILAN } from './comptes.js';

export interface Acte {
  id: string;
  /** Certains actes anciens n'ont pas de date de dépôt. */
  dateDepot?: string;
  nomDocument?: string;
  /** Natures déclarées de l'acte (« Statuts mis à jour », « Procès-verbal d'assemblée générale »…). */
  types: string[];
  /** Décisions associées (« Modification(s) statutaire(s) »…). */
  decisions: string[];
  contientStatuts: boolean;
  /** L'acte ne porte aucune indication de nature : impossible de dire s'il contient des statuts. */
  natureInconnue: boolean;
  confidentiel: boolean;
}

export interface Comptes {
  id: string;
  dateCloture?: string;
  dateDepot?: string;
  typeBilan?: string;
  libelleType?: string;
  confidentiel: boolean;
  /** Identifiant des données chiffrées saisies par l'INPI pour cet exercice, s'il en existe. */
  idSaisie?: string;
}

export interface Documents {
  actes: Acte[];
  comptes: Comptes[];
}

type Objet = Record<string, unknown>;

const STATUTS = /statut/i;

export function analyserDocuments(donnees: unknown): Documents {
  const racine = (donnees ?? {}) as Objet;
  const actes = tableau(racine.actes)
    .filter((a) => a.deleted !== true)
    .map(lireActe)
    .sort(parDateDecroissante);

  const saisis = tableau(racine.bilansSaisis).filter((b) => b.deleted !== true);
  const comptes = tableau(racine.bilans)
    .filter((b) => b.deleted !== true)
    .map((b): Comptes => {
      const type = texte(b.typeBilan);
      const saisie = saisis.find(
        (s) => (texte(s.numNat) && texte(s.numNat) === texte(b.numNat)) || (texte(s.dateCloture) && texte(s.dateCloture) === texte(b.dateCloture) && texte(s.typeBilan) === type),
      );
      return {
        id: String(b.id),
        dateCloture: texte(b.dateCloture),
        dateDepot: texte(b.dateDepot),
        typeBilan: type,
        libelleType: type ? (TYPES_BILAN[type] ?? `Type ${type}`) : undefined,
        confidentiel: texte(b.confidentiality) !== undefined && texte(b.confidentiality) !== 'Public',
        ...(saisie ? { idSaisie: String(saisie.id) } : {}),
      };
    })
    .sort((a, b) => (b.dateCloture ?? '').localeCompare(a.dateCloture ?? ''));

  return { actes, comptes };
}

function lireActe(a: Objet): Acte {
  const rdd = tableau(a.typeRdd);
  const types = rdd.map((r) => texte(r.typeActe)).filter((t): t is string => Boolean(t));
  const decisions = rdd.map((r) => texte(r.decision)).filter((t): t is string => Boolean(t));
  const codeDocument = texte(a.typeDocument);
  const libelle = texte(a.libelle) ?? (codeDocument ? TYPES_DOCUMENT[codeDocument] : undefined);
  if (libelle && !types.includes(libelle)) types.push(libelle);
  return {
    id: String(a.id),
    dateDepot: texte(a.dateDepot),
    nomDocument: texte(a.nomDocument),
    types,
    decisions,
    contientStatuts: types.some((t) => STATUTS.test(t)),
    natureInconnue: types.length === 0,
    confidentiel: texte(a.confidentiality) !== undefined && texte(a.confidentiality) !== 'Public',
  };
}

function parDateDecroissante(a: Acte, b: Acte): number {
  // Les actes sans date de dépôt sont placés en fin de liste.
  return (b.dateDepot ?? '0000').localeCompare(a.dateDepot ?? '0000');
}

function tableau(v: unknown): Objet[] {
  return Array.isArray(v) ? (v.filter((x) => x && typeof x === 'object') as Objet[]) : [];
}

function texte(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() ? v.trim() : undefined;
}
