// Lecture des personnes (déposants, titulaires, mandataires, bénéficiaires
// d'inscription) dans les notices XML de l'INPI.
//
// Les blocs ont tous la même forme, seul leur préfixe change : Applicant,
// fr-CurrentHolder, Representative, Claimant, Holder, Designer… On cherche
// donc les sous-éléments par suffixe (…Identifier, …LegalEntity,
// …AddressBook) plutôt que par nom complet.

import { attribut, espaces, liste, sous, texte, texteDe, type Noeud } from './xml.js';

export interface Personne {
  nom: string;
  /** Numéro SIREN, lorsqu'il est fourni pour une entité française. */
  siren?: string;
  /** Autre identifiant attribué par l'office (EUIPO, OMPI…). */
  identifiant?: string;
  formeJuridique?: string;
  adresse?: string;
  /** Personne morale (PM) ou physique (PP), si l'INPI le précise. */
  typePersonne?: string;
}

/** Valeur du premier sous-élément dont le nom se termine par le suffixe donné. */
function parSuffixe(noeud: Noeud, suffixe: string): unknown {
  const cle = Object.keys(noeud).find((k) => !k.startsWith('@') && k.endsWith(suffixe));
  return cle ? noeud[cle] : undefined;
}

const SIREN = /^\d{9}$/;
const GENERIQUES = /^(Legal (Entity|Person)|Natural Person)$/i;

/** Lit une personne à partir de son bloc XML (Applicant, Claimant, etc.). */
export function lirePersonne(bloc: unknown): Personne | undefined {
  if (!bloc || typeof bloc !== 'object' || Array.isArray(bloc)) return undefined;
  const n = bloc as Noeud;
  const carnet = parSuffixe(n, 'AddressBook');
  const nomAdresse = sous(carnet, 'FormattedNameAddress');
  const nomFormate = sous(nomAdresse, 'Name.FormattedName');

  const organisation = espaces(texteDe(nomFormate, 'OrganizationName'));
  const nomFamille = espaces(texteDe(nomFormate, 'LastName'));
  const prenom = espaces(texteDe(nomFormate, 'FirstName'));
  const personnePhysique = [prenom, nomFamille].filter(Boolean).join(' ') || undefined;
  const lignesLibres = liste(sous(nomAdresse, 'Name.FreeFormatName.FreeFormatNameDetails.FreeFormatNameLine'))
    .map(texte)
    .filter(Boolean);

  let nom: string | undefined;
  if (organisation && personnePhysique && nomFamille !== organisation) {
    // Par exemple un mandataire : cabinet et conseil désigné.
    nom = prenom ? `${organisation} (${personnePhysique})` : organisation;
  } else {
    nom = organisation ?? personnePhysique ?? (lignesLibres.length ? lignesLibres.join(', ') : undefined);
  }
  nom ??= espaces(texte(sous(carnet, 'PostalAddress')));
  if (!nom) return undefined;

  // Identifiant : SIREN pour une entité française, identifiant d'office sinon.
  const identifiantBrut = espaces(texte(parSuffixe(n, 'Identifier')));
  const identifiantIndividuel = espaces(texteDe(nomFormate, 'IndividualIdentifier'));
  const genreIdentifiant = attribut(parSuffixe(n, 'Identifier'), 'identifierKindCode');
  let siren: string | undefined;
  let identifiant: string | undefined;
  for (const candidat of [identifiantBrut, identifiantIndividuel]) {
    if (!candidat) continue;
    if (SIREN.test(candidat) && (genreIdentifiant === undefined || genreIdentifiant === 'FR')) siren ??= candidat;
    else identifiant ??= candidat;
  }
  if (siren && identifiant === siren) identifiant = undefined;

  // Les offices européens indiquent parfois seulement « Legal Entity » : la forme
  // juridique précise figure alors dans LegalForm.
  const formeJuridique = [espaces(texte(parSuffixe(n, 'LegalEntity'))), espaces(texteDe(nomFormate, 'LegalForm'))].find(
    // Certains offices placent le nom complet dans …LegalEntity : on l'ignore alors.
    (f) => f && !GENERIQUES.test(f) && f !== nom,
  );

  return {
    nom,
    ...(siren ? { siren } : {}),
    ...(identifiant ? { identifiant } : {}),
    ...(formeJuridique ? { formeJuridique } : {}),
    ...(lireAdresse(sous(nomAdresse, 'Address')) ? { adresse: lireAdresse(sous(nomAdresse, 'Address')) } : {}),
    ...(attribut(n, 'PersonType') ? { typePersonne: attribut(n, 'PersonType') } : {}),
  };
}

/** Assemble une adresse lisible (rue, code postal, ville, pays). */
export function lireAdresse(adresse: unknown): string | undefined {
  if (!adresse) return undefined;
  const formatee = sous(adresse, 'FormattedAddress');
  const pays = texteDe(adresse, 'AddressCountryCode') ?? texteDe(formatee, 'FormattedAddressCountryCode');
  const lignesLibres = liste(sous(adresse, 'FreeFormatAddress.FreeFormatAddressLine')).map(texte).filter(Boolean);
  const parties = formatee
    ? [
        espaces(texteDe(formatee, 'AddressStreet')),
        [texteDe(formatee, 'AddressPostcode'), espaces(texteDe(formatee, 'AddressCity'))].filter(Boolean).join(' '),
      ]
    : lignesLibres;
  const corps = parties.filter(Boolean).join(', ');
  if (!corps) return pays;
  return pays && pays !== 'FR' ? `${corps} (${pays})` : corps;
}

/** Lit tous les blocs personnes d'un conteneur (…Details > …). */
export function lirePersonnes(conteneur: unknown, element: string): Personne[] {
  return liste(sous(conteneur, element))
    .map(lirePersonne)
    .filter((p): p is Personne => p !== undefined);
}

/** Représentation d'une personne sur une ligne. */
export function personneEnLigne(p: Personne): string {
  const details = [
    p.formeJuridique,
    p.siren ? `SIREN ${p.siren}` : undefined,
    p.identifiant ? `identifiant ${p.identifiant}` : undefined,
  ].filter(Boolean);
  return `${p.nom}${details.length ? ` (${details.join(', ')})` : ''}${p.adresse ? ` — ${p.adresse}` : ''}`;
}
