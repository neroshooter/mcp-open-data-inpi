// Analyse de la formalité d'une entreprise renvoyée par l'API RNE
// (GET /api/companies/{siren}).
//
// Les bénéficiaires effectifs sont volontairement ignorés : leur accès est
// restreint depuis l'arrêt de la CJUE du 22 novembre 2022 (C-37/20 et
// C-601/20). Les dates de naissance des dirigeants ne sont pas reprises.

import { FORMES_JURIDIQUES, ROLES_ENTREPRISE, TYPES_VOIE } from '../referentiels/rne.js';

type Objet = Record<string, unknown>;

export interface Dirigeant {
  qualite: string;
  codeQualite: string;
  nom: string;
  /** Personne morale : SIREN et forme juridique. */
  siren?: string;
  formeJuridique?: string;
  /** Représentant permanent d'une personne morale dirigeante, s'il est indiqué. */
  representant?: string;
  actif: boolean;
}

export interface FicheEntreprise {
  siren: string;
  denomination?: string;
  sigle?: string;
  typePersonne: 'morale' | 'physique' | 'exploitation' | 'inconnu';
  formeJuridique?: string;
  codeFormeJuridique?: string;
  capital?: { montant: number; devise: string; variable: boolean; minimum?: number };
  objet?: string;
  dureeAnnees?: number;
  dateFinExistence?: string;
  dateClotureExercice?: string;
  datePremiereCloture?: string;
  siege?: string;
  siretSiege?: string;
  codeApe?: string;
  dateCreation?: string;
  immatriculations: Array<{ registre: string; date: string }>;
  dateCessation?: string;
  dirigeants: Dirigeant[];
  commissairesAuxComptes: Dirigeant[];
  nombreEtablissementsOuverts?: number;
  diffusionINSEE?: string;
  diffusionCommerciale?: boolean;
  associeUnique?: boolean;
  economieSocialeSolidaire?: boolean;
  societeAMission?: boolean;
  miseAJour?: string;
}

const REGISTRES: Record<string, string> = {
  rncs: 'Registre du commerce et des sociétés (RCS)',
  rnm: 'Répertoire des métiers (RNM)',
  raa: 'Registre des actifs agricoles (RAA)',
  rseirl: 'Registre spécial des EIRL',
  rsac: 'Registre spécial des agents commerciaux (RSAC)',
};

/** Qualités des commissaires aux comptes (titulaire et suppléant). */
const CODES_CAC = new Set(['71', '72']);

export function analyserEntreprise(donnees: unknown): FicheEntreprise {
  const racine = objet(donnees);
  const formalite = objet(racine.formality);
  const contenu = objet(formalite.content);
  const pm = contenu.personneMorale ? objet(contenu.personneMorale) : undefined;
  const pp = contenu.personnePhysique ? objet(contenu.personnePhysique) : undefined;
  const ex = contenu.exploitation ? objet(contenu.exploitation) : undefined;
  const corps = pm ?? pp ?? ex ?? {};
  const identite = objet(corps.identite);
  const entreprise = objet(identite.entreprise);
  const description = objet(identite.description);

  const codeForme = chaine(entreprise.formeJuridique) ?? chaine(formalite.formeJuridique) ?? chaine(objet(contenu.natureCreation).formeJuridique);
  const pouvoirs = tableau(objet(corps.composition).pouvoirs).map(objet);
  const tous = pouvoirs.map(lireDirigeant).filter((d): d is Dirigeant => d !== undefined);

  const registres = objet(contenu.registreAnterieur);
  const immatriculations = Object.entries(registres)
    .map(([cle, v]) => ({ cle, v: objet(v) }))
    .filter(({ v }) => v.estPresent === true && typeof v.dateImmatriculation === 'string')
    .map(({ cle, v }) => ({ registre: REGISTRES[cle] ?? cle.toUpperCase(), date: String(v.dateImmatriculation).slice(0, 10) }));

  const montant = nombre(description.montantCapital);
  const fiche: FicheEntreprise = {
    siren: chaine(formalite.siren) ?? chaine(racine.siren) ?? '',
    denomination:
      chaine(entreprise.denomination) ??
      nomPersonnePhysique(objet(objet(identite.entrepreneur).descriptionPersonne)),
    sigle: chaine(entreprise.sigle),
    typePersonne: pm ? 'morale' : pp ? 'physique' : ex ? 'exploitation' : 'inconnu',
    codeFormeJuridique: codeForme,
    formeJuridique: codeForme ? libelleForme(codeForme, description.indicateurAssocieUnique === true) : undefined,
    capital:
      montant !== undefined
        ? {
            montant,
            devise: chaine(description.deviseCapital) ?? 'EUR',
            variable: description.capitalVariable === true,
            ...(nombre(description.capitalMinimum) !== undefined ? { minimum: nombre(description.capitalMinimum) } : {}),
          }
        : undefined,
    objet: espaces(chaine(description.objet)),
    dureeAnnees: nombre(description.duree),
    dateFinExistence: chaine(description.dateFinExistence),
    dateClotureExercice: chaine(description.dateClotureExerciceSocial),
    datePremiereCloture: chaine(description.datePremiereCloture),
    siege: adresse(objet(objet(corps.adresseEntreprise).adresse)),
    siretSiege:
      chaine(objet(objet(corps.etablissementPrincipal).descriptionEtablissement).siret) ??
      (chaine(entreprise.nicSiege) && chaine(formalite.siren) ? `${chaine(formalite.siren)}${chaine(entreprise.nicSiege)}` : undefined),
    codeApe: chaine(entreprise.codeApe),
    dateCreation: chaine(objet(contenu.natureCreation).dateCreation) ?? chaine(entreprise.dateDebutActiv),
    immatriculations,
    dateCessation: chaine(objet(contenu.natureCessation).dateCessationTotaleActivite) ?? chaine(objet(contenu.natureCessation).dateRadiation),
    dirigeants: tous.filter((d) => !CODES_CAC.has(d.codeQualite)),
    commissairesAuxComptes: tous.filter((d) => CODES_CAC.has(d.codeQualite)),
    nombreEtablissementsOuverts: nombre(racine.nombreEtablissementsOuverts),
    diffusionINSEE: chaine(formalite.diffusionINSEE),
    diffusionCommerciale: typeof formalite.diffusionCommerciale === 'boolean' ? formalite.diffusionCommerciale : undefined,
    associeUnique: typeof description.indicateurAssocieUnique === 'boolean' ? description.indicateurAssocieUnique : undefined,
    economieSocialeSolidaire: description.ess === true ? true : undefined,
    societeAMission: description.societeMission === true ? true : undefined,
    miseAJour: chaine(racine.updatedAt),
  };
  return fiche;
}

function lireDirigeant(p: Objet): Dirigeant | undefined {
  const code = chaine(p.roleEntreprise) ?? chaine(objet(objet(p.individu).descriptionPersonne).role) ?? '';
  const qualite = ROLES_ENTREPRISE[code] ?? (code ? `Qualité ${code}` : 'Qualité non précisée');
  const actif = p.actif !== false;
  if (p.individu) {
    const nom = nomPersonnePhysique(objet(objet(p.individu).descriptionPersonne));
    return nom ? { qualite, codeQualite: code, nom, actif } : undefined;
  }
  if (p.entreprise) {
    const e = objet(p.entreprise);
    const forme = chaine(e.formeJuridique);
    const rep = p.representant ? nomPersonnePhysique(objet(objet(p.representant).descriptionPersonne)) : undefined;
    return {
      qualite,
      codeQualite: code,
      nom: chaine(e.denomination) ?? 'Dénomination non renseignée',
      ...(chaine(e.siren) ? { siren: chaine(e.siren) } : {}),
      ...(forme ? { formeJuridique: FORMES_JURIDIQUES[forme] ?? forme } : {}),
      ...(rep ? { representant: rep } : {}),
      actif,
    };
  }
  return undefined;
}

/**
 * Nom d'une personne physique, toujours sous la forme « Prénom(s) NOM ». Le RNE
 * mélange les casses (« VIRGINIE » en prénom, « Birade » en nom) : on les
 * normalise pour que l'ordre se lise sans ambiguïté.
 */
function nomPersonnePhysique(d: Objet): string | undefined {
  const prenoms = tableau(d.prenoms).map((p) => cassePropre(String(p))).join(' ');
  const nom = chaine(d.nom)?.toLocaleUpperCase('fr-FR');
  const usage = chaine(d.nomUsage)?.toLocaleUpperCase('fr-FR');
  if (!nom && !prenoms) return undefined;
  const base = [prenoms, nom].filter(Boolean).join(' ');
  return usage && usage !== nom ? `${base} (nom d'usage : ${usage})` : base;
}

/** « JEAN-BAPTISTE » ou « jean-baptiste » devient « Jean-Baptiste ». */
export function cassePropre(mot: string): string {
  return mot
    .trim()
    .toLocaleLowerCase('fr-FR')
    .replace(/(^|[\s'’-])(\p{L})/gu, (_t, sep: string, l: string) => sep + l.toLocaleUpperCase('fr-FR'));
}

function libelleForme(code: string, associeUnique: boolean): string {
  const libelle = FORMES_JURIDIQUES[code] ?? `Forme juridique ${code}`;
  if (associeUnique && code === '5710') return `${libelle} unipersonnelle (SASU)`;
  if (associeUnique && code === '5499') return `${libelle} unipersonnelle (EURL)`;
  return libelle;
}

/** Assemble une adresse RNE (numéro, type de voie, voie, code postal, commune, pays). */
export function adresse(a: Objet): string | undefined {
  const typeVoie = chaine(a.typeVoie);
  const ligne1 = [
    chaine(a.numVoie),
    chaine(a.indiceRepetition),
    typeVoie ? (TYPES_VOIE[typeVoie] ?? typeVoie) : undefined,
    chaine(a.voie),
  ]
    .filter(Boolean)
    .join(' ');
  const ligne2 = [chaine(a.complementLocalisation), chaine(a.distributionSpeciale)].filter(Boolean).join(', ');
  const ligne3 = [chaine(a.codePostal), chaine(a.commune)].filter(Boolean).join(' ');
  const pays = chaine(a.pays);
  const parties = [ligne1, ligne2, ligne3].filter(Boolean);
  if (!parties.length) return undefined;
  return `${parties.join(', ')}${pays && pays !== 'FRANCE' ? ` (${pays})` : ''}`;
}

function objet(v: unknown): Objet {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Objet) : {};
}

function tableau(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

function chaine(v: unknown): string | undefined {
  if (typeof v === 'string') return v.trim() || undefined;
  if (typeof v === 'number') return String(v);
  return undefined;
}

function nombre(v: unknown): number | undefined {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() && Number.isFinite(Number(v))) return Number(v);
  return undefined;
}

function espaces(v: string | undefined): string | undefined {
  return v?.replace(/\s+/g, ' ').trim() || undefined;
}
