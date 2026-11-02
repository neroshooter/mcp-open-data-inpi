// Lecture des chiffres clés des comptes annuels saisis par l'INPI
// (bilansSaisis), qui reprennent les codes de la liasse fiscale.
//
// Correspondances vérifiées dans la « Documentation technique API comptes
// annuels » de l'INPI (v6, septembre 2026) et, pour les comptes complets,
// sur des comptes réels (cohérence total actif = total passif) :
//
// Comptes complets (C) et consolidés (K), formulaires 2050 et suivants :
//   page 01 actif : m3 = net N, m4 = net N-1 ; page 02 passif : m1 = N, m2 = N-1 ;
//   page 03 compte de résultat : FJ et GG en m3 = N, m4 = N-1 ; HN en m1 = N, m2 = N-1.
// Comptes simplifiés (S), formulaires 2033 :
//   page 01 bilan : passif en m3 = N, m4 = N-1 ; page 02 résultat : m1 = N, m2 = N-1.

export interface Poste {
  libelle: string;
  /** Codes de liasse additionnés pour obtenir la valeur. */
  codes: string[];
  colonneN: 'm1' | 'm2' | 'm3' | 'm4';
  colonneN1?: 'm1' | 'm2' | 'm3' | 'm4';
  /** Précision affichée avec la valeur. */
  note?: string;
}

export const POSTES_COMPLETS: Poste[] = [
  { libelle: "Chiffre d'affaires net", codes: ['FJ'], colonneN: 'm3', colonneN1: 'm4' },
  { libelle: "Résultat d'exploitation", codes: ['GG'], colonneN: 'm3', colonneN1: 'm4' },
  { libelle: 'Résultat net (bénéfice ou perte)', codes: ['HN'], colonneN: 'm1', colonneN1: 'm2' },
  { libelle: 'Capital social', codes: ['DA'], colonneN: 'm1', colonneN1: 'm2' },
  { libelle: 'Capitaux propres', codes: ['DL'], colonneN: 'm1', colonneN1: 'm2' },
  { libelle: 'Total des dettes', codes: ['EC'], colonneN: 'm1', colonneN1: 'm2' },
  { libelle: 'Total du bilan', codes: ['EE'], colonneN: 'm1', colonneN1: 'm2' },
  { libelle: 'Effectif moyen', codes: ['YP'], colonneN: 'm1', colonneN1: 'm2' },
];

export const POSTES_SIMPLIFIES: Poste[] = [
  {
    libelle: "Chiffre d'affaires net",
    codes: ['210', '214', '218'],
    colonneN: 'm1',
    colonneN1: 'm2',
    note: 'somme des postes 210, 214 et 218 du formulaire 2033-B (ventes de marchandises, production vendue de biens et de services)',
  },
  { libelle: "Résultat d'exploitation", codes: ['270'], colonneN: 'm1', colonneN1: 'm2' },
  { libelle: 'Résultat net (bénéfice ou perte)', codes: ['310'], colonneN: 'm1', colonneN1: 'm2' },
  { libelle: 'Capital social', codes: ['120'], colonneN: 'm3', colonneN1: 'm4' },
  { libelle: 'Capitaux propres', codes: ['142'], colonneN: 'm3', colonneN1: 'm4' },
  { libelle: 'Total des dettes', codes: ['176'], colonneN: 'm3', colonneN1: 'm4' },
  { libelle: 'Total du bilan', codes: ['180'], colonneN: 'm3', colonneN1: 'm4' },
  { libelle: 'Effectif moyen', codes: ['376'], colonneN: 'm1' },
];

export const TYPES_BILAN: Record<string, string> = {
  C: 'Comptes annuels complets',
  S: 'Comptes annuels simplifiés',
  K: 'Comptes consolidés',
  B: 'Comptes annuels de banque',
  A: "Comptes annuels d'assurance",
  AC: "Comptes annuels d'assurance",
  CA: 'Comptes annuels agricoles complets',
  SA: 'Comptes annuels agricoles simplifiés',
};

export const CONFIDENTIALITE: Record<string, string> = {
  '0': 'Comptes publics',
  '1': 'Comptes confidentiels : seule l’identité du dépôt est diffusée, aucune donnée chiffrée',
  '2': 'Compte de résultat confidentiel : seules les données du bilan sont diffusées',
  '3': 'Comptes faisant l’objet d’une publication simplifiée',
  '4': 'Rapport du commissaire aux comptes et compte de résultat confidentiels',
};

export interface ValeurPoste {
  libelle: string;
  n?: number;
  n1?: number;
  note?: string;
}

export interface ChiffresCles {
  id: string;
  denomination?: string;
  typeBilan: string;
  libelleType: string;
  dateCloture?: string;
  dateCloturePrecedente?: string;
  dureeMois?: number;
  dureeMoisPrecedente?: number;
  dateDepot?: string;
  devise?: string;
  confidentialite: string;
  /** Postes lus ; vide si le type de comptes n'est pas pris en charge ou si les comptes sont confidentiels. */
  postes: ValeurPoste[];
  /** Raison pour laquelle aucun chiffre n'est restitué, le cas échéant. */
  avertissement?: string;
}

type Objet = Record<string, unknown>;
type Ligne = { code: string; m1?: string; m2?: string; m3?: string; m4?: string };

/** Convertit un montant de liasse (« -000000002197350 ») en nombre. */
export function montantLiasse(v: string | undefined): number | undefined {
  if (v === undefined || v === null) return undefined;
  const t = String(v).trim();
  if (!/^-?\d+$/.test(t)) return undefined;
  return Number(t);
}

export function lireChiffresCles(bilanSaisi: unknown): ChiffresCles {
  const racine = (bilanSaisi ?? {}) as Objet;
  const bilan = ((racine.bilanSaisi as Objet | undefined)?.bilan ?? {}) as Objet;
  const identite = (bilan.identite ?? {}) as Objet;
  const pages = (((bilan.detail ?? {}) as Objet).pages ?? []) as Array<{ numero: number; liasses?: Ligne[] }>;
  const type = String(identite.codeTypeBilan ?? racine.typeBilan ?? '');
  const confid = String(identite.codeConfidentialite ?? '0');

  const lignes = new Map<string, Ligne>();
  for (const p of pages) for (const l of p.liasses ?? []) if (!lignes.has(l.code)) lignes.set(l.code, l);

  const resultat: ChiffresCles = {
    id: String(racine.id ?? ''),
    denomination: texte(identite.denomination ?? racine.denomination),
    typeBilan: type,
    libelleType: TYPES_BILAN[type] ?? `Comptes de type ${type || 'inconnu'}`,
    dateCloture: texte(identite.dateClotureExercice ?? racine.dateCloture),
    dateCloturePrecedente: texte(identite.dateClotureExerciceNMoins1),
    dureeMois: entier(identite.dureeExerciceN),
    dureeMoisPrecedente: entier(identite.dureeExerciceNMoins1),
    dateDepot: texte(identite.dateDepot ?? racine.dateDepot),
    devise: texte(identite.codeDevise),
    confidentialite: CONFIDENTIALITE[confid] ?? `Indicateur de confidentialité ${confid}`,
    postes: [],
  };

  const codeSaisie = String(identite.codeSaisie ?? '00');
  if (confid === '1') {
    resultat.avertissement = 'Les comptes ont été déposés avec une déclaration de confidentialité : aucune donnée chiffrée n’est diffusée.';
    return resultat;
  }
  if (codeSaisie !== '00' && !lignes.size) {
    resultat.avertissement = `Les comptes n'ont pas été saisis par l'INPI (code de saisie ${codeSaisie}) : consultez le PDF.`;
    return resultat;
  }

  const definitions = type === 'C' || type === 'K' ? POSTES_COMPLETS : type === 'S' ? POSTES_SIMPLIFIES : undefined;
  if (!definitions) {
    resultat.avertissement =
      `La lecture automatique des chiffres clés n'est pas prise en charge pour ce type de comptes (${resultat.libelleType}) : ` +
      'téléchargez le PDF des comptes pour les consulter.';
    return resultat;
  }

  for (const poste of definitions) {
    const presents = poste.codes.map((c) => lignes.get(c)).filter((l): l is Ligne => l !== undefined);
    if (!presents.length) continue;
    const somme = (col?: 'm1' | 'm2' | 'm3' | 'm4') => {
      if (!col) return undefined;
      const valeurs = presents.map((l) => montantLiasse(l[col])).filter((v): v is number => v !== undefined);
      return valeurs.length ? valeurs.reduce((a, b) => a + b, 0) : undefined;
    };
    const valeur: ValeurPoste = { libelle: poste.libelle, n: somme(poste.colonneN), n1: somme(poste.colonneN1) };
    if (poste.note) valeur.note = poste.note;
    if (valeur.n !== undefined || valeur.n1 !== undefined) resultat.postes.push(valeur);
  }
  if (confid === '2' || confid === '4') {
    resultat.avertissement = 'Le compte de résultat est confidentiel : seuls les postes du bilan sont diffusés.';
  }
  return resultat;
}

function texte(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() ? v.trim() : undefined;
}

function entier(v: unknown): number | undefined {
  const n = Number(v);
  return v !== undefined && v !== '' && Number.isFinite(n) ? n : undefined;
}
