// Fabrique les jeux de données de test anonymisés à partir de réponses réelles de l'INPI.
//
// Usage : node scripts/anonymiser-jeux.mjs <fichier> [<fichier>...]
//   - notices de marques XML (le nom du fichier sert d'identifiant) ;
//   - réponses JSON du RNE nommées *_companies_<siren>.json ou *_attachments.json.
// Les fichiers produits sont écrits dans tests/jeux-de-donnees/.
//
// Toutes les données d'identification (noms, prénoms, adresses, SIREN, numéros,
// identifiants, dates de naissance, montants) sont remplacées par des valeurs
// fictives cohérentes : une même valeur d'origine reçoit toujours le même
// remplaçant, ce qui préserve la structure utile aux tests. Les fichiers
// d'origine ne doivent jamais être versionnés ; relisez toujours le résultat.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SORTIE = join(dirname(fileURLToPath(import.meta.url)), '..', 'tests', 'jeux-de-donnees');
mkdirSync(SORTIE, { recursive: true });

// --- Remplacements cohérents ------------------------------------------------

const tables = new Map();
function substitut(categorie, original, fabrique) {
  if (!tables.has(categorie)) tables.set(categorie, new Map());
  const table = tables.get(categorie);
  if (!table.has(original)) table.set(original, fabrique(table.size + 1, original));
  return table.get(original);
}

/** Chiffres fictifs de même longueur que l'original (déterministes). */
function chiffres(n, longueur) {
  return String(900000000000 + n * 7919).slice(-longueur).padStart(longueur, '9');
}

const ORGANISATIONS = (n) => `SOCIETE EXEMPLE ${n}`;
const PERSONNES = (n) => `NOM${n}`;
const PRENOMS = (n) => `Prenom${n}`;
const RUES = (n) => `${n} rue de l'Exemple`;
const VILLES = (n) => `Villexemple-${n}`;

// --- Notices XML -------------------------------------------------------------

const REGLES_XML = {
  OrganizationName: (v) => substitut('org', v, ORGANISATIONS),
  LastName: (v) => (/[,.]|SOCI|SAS|SA\b|LTD|GMBH|FRANCE/i.test(v) ? substitut('org', v, ORGANISATIONS) : substitut('nom', v, PERSONNES)),
  FirstName: (v) => substitut('prenom', v, PRENOMS),
  FreeFormatNameLine: (v) => substitut('org', v, ORGANISATIONS),
  FreeFormatAddressLine: (v) => substitut('rue', v, RUES),
  PostalAddress: (v) => substitut('rue', v, RUES),
  AddressStreet: (v) => substitut('rue', v, RUES),
  AddressCity: (v) => substitut('ville', v, VILLES),
  AddressPostcode: (v) => (/^\d+$/.test(v) ? substitut('cp', v, (n) => String(10000 + n * 101)) : 'X-0000'),
  IndividualIdentifier: (v) => substitut('id', v, (n, o) => chiffres(n, o.length)),
  ApplicantIdentifier: (v) => substitut('id', v, (n, o) => chiffres(n, o.length)),
  'fr-CurrentHolderIdentifier': (v) => substitut('id', v, (n, o) => chiffres(n, o.length)),
  ClaimantIdentifier: (v) => substitut('id', v, (n, o) => chiffres(n, o.length)),
  RepresentativeIdentifier: (v) => substitut('id', v, (n, o) => chiffres(n, o.length)),
  CorrespondenceAddressIdentifier: (v) => substitut('id', v, (n, o) => chiffres(n, o.length)),
  MarkVerbalElementText: (v) => substitut('marque', v, (n) => (/[a-z]/.test(v) ? `la marque exemple ${n}` : `MARQUE EXEMPLE ${n}`)),
  MarkImageFilename: () => 'IMAGE-EXEMPLE',
  ApplicationNumber: (v) => substitut('numero', v, (n, o) => chiffres(n + 50, o.length)),
  BasicRegistrationNumber: (v) => substitut('numero', v, (n) => `Z-${chiffres(n, 9)}`),
  RecordReference: (v) => substitut('ref', v, (n, o) => chiffres(n + 100, o.length)),
  MarkDescription: () => "Description d'exemple",
};

function anonymiserXML(xml) {
  let resultat = xml;
  for (const [balise, regle] of Object.entries(REGLES_XML)) {
    const motif = new RegExp(`<${balise}((?:\\s[^>]*)?)>(<!\\[CDATA\\[)?([\\s\\S]*?)(\\]\\]>)?</${balise}>`, 'g');
    resultat = resultat.replace(motif, (_tout, attributs, debutCdata, valeur, finCdata) => {
      const propre = valeur.trim();
      const nouvelle = propre ? regle(propre) : propre;
      return `<${balise}${attributs}>${debutCdata ?? ''}${nouvelle}${finCdata ?? ''}</${balise}>`;
    });
  }
  return resultat;
}

// --- Réponses JSON du RNE ----------------------------------------------------

const CLES_TEXTE = {
  denomination: (v) => substitut('org', v, ORGANISATIONS),
  nom: (v) => substitut('nom', v, PERSONNES),
  nomUsage: (v) => substitut('nom', v, PERSONNES),
  voie: (v) => substitut('voie', v, (n) => `DE L'EXEMPLE ${n}`),
  numVoie: (v) => substitut('num', v, (n) => String(n)),
  commune: (v) => substitut('ville', v, VILLES),
  codePostal: (v) => substitut('cp', v, (n) => String(10000 + n * 101)),
  codeInseeCommune: (v) => substitut('insee', v, (n) => String(10000 + n * 101)),
  lieuDeNaissance: (v) => substitut('ville', v, VILLES),
  dateDeNaissance: () => '1970-01',
  siren: (v) => substitut('siren', v, (n) => chiffres(n, 9)),
  siret: (v) => substitut('siren', v.slice(0, 9), (n) => chiffres(n, 9)) + v.slice(9),
  nicSiege: (v) => v,
  objet: () => "Objet social d'exemple : fabrication et vente de produits de démonstration.",
  texte: () => "Observation d'exemple.",
  nomDocument: (v) => substitut('doc', v, (n) => `document_exemple_${n}`),
  numNat: (v) => substitut('numnat', v, (n) => `X${chiffres(n, 11)}`),
  numChrono: (v) => substitut('chrono', v, (n) => String(n)),
  numeroLiasse: (v) => substitut('liasse', v, (n) => `X${chiffres(n, 11)}`),
  representantId: (v) => substitut('uuid', v, (n) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`),
  id: (v) => substitut('hex', v, (n) => n.toString(16).padStart(24, 'a')),
  adresse: () => '10000 VILLEXEMPLE',
  cheminDateEffetId: () => 'content.exemple',
  codeApe: (v) => v,
  enseigne: (v) => substitut('org', v, ORGANISATIONS),
  nomCommercial: (v) => substitut('org', v, ORGANISATIONS),
  sigle: () => 'SE',
  complementLocalisation: () => 'BATIMENT EXEMPLE',
  distributionSpeciale: () => 'BP EXEMPLE',
  autreOrigine: () => "Origine d'exemple",
  activiteId: (v) => substitut('uuid', v, (n) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`),
  lieuDeNaissanceEtranger: (v) => substitut('ville', v, VILLES),
  nomDeNaissance: (v) => substitut('nom', v, PERSONNES),
  email: () => 'exemple@exemple.invalid',
  telephone: () => '0000000000',
};
const CLES_TABLEAU = { prenoms: (v) => v.map((p) => substitut('prenom', p, PRENOMS)) };

/** Facteur appliqué aux montants (capital, liasse) pour ne pas reproduire les comptes réels. */
const FACTEUR = 0.37;
function montantLiasse(v) {
  const negatif = v.startsWith('-');
  const n = Math.round(Number(v.replace('-', '')) * FACTEUR);
  return `${negatif ? '-' : ''}${String(n).padStart(15, '0')}`;
}

function anonymiserJSON(valeur, cle) {
  if (Array.isArray(valeur)) {
    if (cle && CLES_TABLEAU[cle]) return CLES_TABLEAU[cle](valeur);
    return valeur.map((v) => anonymiserJSON(v));
  }
  if (valeur && typeof valeur === 'object') {
    const copie = {};
    for (const [k, v] of Object.entries(valeur)) {
      if (k === 'liasses' && Array.isArray(v)) {
        copie[k] = v.map((l) =>
          Object.fromEntries(Object.entries(l).map(([c, m]) => [c, c === 'code' ? m : montantLiasse(String(m))])),
        );
      } else if (k === 'montantCapital' && typeof v === 'number') {
        copie[k] = Math.round(v * FACTEUR);
      } else {
        copie[k] = anonymiserJSON(v, k);
      }
    }
    return copie;
  }
  if (typeof valeur === 'string' && cle && CLES_TEXTE[cle]) return CLES_TEXTE[cle](valeur);
  return valeur;
}

/** Réduit les listes volumineuses pour garder des jeux compacts. */
function reduire(donnees) {
  const pm = donnees?.formality?.content?.personneMorale;
  if (pm?.autresEtablissements) pm.autresEtablissements = pm.autresEtablissements.slice(0, 2);
  if (pm?.observations?.rcs) pm.observations.rcs = pm.observations.rcs.slice(0, 1);
  if (donnees?.formality?.historique) donnees.formality.historique = donnees.formality.historique.slice(0, 3);
  return donnees;
}

// --- Traitement --------------------------------------------------------------

for (const fichier of process.argv.slice(2)) {
  const contenu = readFileSync(fichier, 'utf8');
  const nom = basename(fichier);
  let cible;
  let resultat;
  if (nom.endsWith('.xml')) {
    const prefixe = nom.slice(0, 2).toUpperCase();
    cible = `marque-${prefixe.toLowerCase()}-${substitut('fichier', nom, (n) => n)}.xml`;
    resultat = anonymiserXML(contenu);
  } else if (nom.endsWith('_attachments.json')) {
    cible = 'rne-documents.json';
    resultat = `${JSON.stringify(anonymiserJSON(JSON.parse(contenu)), null, 2)}\n`;
  } else if (nom.endsWith('.json')) {
    cible = 'rne-entreprise.json';
    resultat = `${JSON.stringify(reduire(anonymiserJSON(JSON.parse(contenu))), null, 2)}\n`;
  } else {
    console.error(`Ignoré : ${fichier}`);
    continue;
  }
  writeFileSync(join(SORTIE, cible), resultat);
  console.log(`${fichier} -> tests/jeux-de-donnees/${cible}`);
}
