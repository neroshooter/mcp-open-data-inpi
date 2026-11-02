// Mise en forme Markdown des réponses relatives au Registre national des entreprises.

import type { ChiffresCles } from '../analyseurs/comptes.js';
import type { Documents } from '../analyseurs/documents.js';
import type { Dirigeant, FicheEntreprise } from '../analyseurs/entreprise.js';
import { champ, dateFr, lignes, montant } from '../presentation.js';

export function lienEntreprise(siren: string): string {
  return `https://data.inpi.fr/entreprises/${siren}`;
}

const NOTE_BE =
  "Les bénéficiaires effectifs ne sont pas restitués : leur accès est restreint depuis l'arrêt de la CJUE du " +
  '22 novembre 2022 (affaires C-37/20 et C-601/20).';

export function formaterFicheEntreprise(f: FicheEntreprise): string {
  const cloture = f.dateClotureExercice && /^\d{4}$/.test(f.dateClotureExercice)
    ? `${f.dateClotureExercice.slice(0, 2)}/${f.dateClotureExercice.slice(2)} (jour/mois)`
    : f.dateClotureExercice;
  const capital = f.capital
    ? `${montant(f.capital.montant, f.capital.devise)}${f.capital.variable ? ' (capital variable' + (f.capital.minimum !== undefined ? `, minimum ${montant(f.capital.minimum, f.capital.devise)}` : '') + ')' : ''}`
    : undefined;

  const sections = [
    lignes(
      `# ${f.denomination ?? 'Entreprise'} — SIREN ${f.siren}`,
      '',
      champ('Dénomination', f.denomination),
      champ('Sigle', f.sigle),
      champ('Forme juridique', f.formeJuridique ? `${f.formeJuridique}${f.codeFormeJuridique ? ` (code ${f.codeFormeJuridique})` : ''}` : undefined),
      champ('Capital social', capital),
      champ('Siège', f.siege),
      champ('SIRET du siège', f.siretSiege),
      champ('Code APE', f.codeApe),
      champ('Durée', f.dureeAnnees !== undefined ? `${f.dureeAnnees} ans` : undefined),
      champ("Date de fin d'existence", dateFr(f.dateFinExistence)),
      champ("Date de clôture de l'exercice social", cloture),
      champ('Date de première clôture', dateFr(f.datePremiereCloture)),
      champ('Date de création', dateFr(f.dateCreation)),
      ...f.immatriculations.map((i) => champ(`Date d'immatriculation (${i.registre})`, dateFr(i.date))),
      champ('Date de cessation', dateFr(f.dateCessation)),
      champ('Établissements ouverts', f.nombreEtablissementsOuverts),
      f.associeUnique !== undefined && champ('Associé unique', f.associeUnique ? 'oui' : 'non'),
      f.economieSocialeSolidaire && champ('Économie sociale et solidaire', 'oui'),
      f.societeAMission && champ('Société à mission', 'oui'),
      champ('Dernière mise à jour au RNE', dateFr(f.miseAJour)),
    ),
    `## Objet social\n\n${f.objet ?? '_Non renseigné dans le RNE._'}`,
    `## Dirigeants\n\n${formaterDirigeants(f.dirigeants) || '_Aucun dirigeant déclaré._'}`,
    `## Commissaires aux comptes\n\n${formaterDirigeants(f.commissairesAuxComptes) || '_Aucun commissaire aux comptes déclaré._'}`,
  ];

  const avertissements: string[] = [NOTE_BE];
  if (f.diffusionINSEE === 'N') {
    avertissements.unshift(
      "⚠️ Cette entreprise s'est opposée à la diffusion de ses données (diffusionINSEE = N) : elles sont affichées " +
        'pour votre seule consultation et ne doivent pas être rediffusées.',
    );
  }
  if (f.diffusionCommerciale === false) {
    avertissements.unshift("ℹ️ Cette entreprise refuse l'utilisation de ses données à des fins de prospection commerciale.");
  }
  sections.push(avertissements.join('\n\n'));
  return sections.join('\n\n');
}

function formaterDirigeants(liste: Dirigeant[]): string {
  const actifs = liste.filter((d) => d.actif);
  const anciens = liste.filter((d) => !d.actif);
  const ligne = (d: Dirigeant) =>
    `- **${d.qualite}** : ${d.nom}${d.formeJuridique ? `, ${d.formeJuridique}` : ''}${d.siren ? ` (SIREN ${d.siren})` : ''}${d.representant ? `, représentée par ${d.representant}` : ''}`;
  return [
    ...actifs.map(ligne),
    ...(anciens.length ? ['', '_Mandats signalés comme inactifs :_', ...anciens.map(ligne)] : []),
  ].join('\n');
}

export function formaterDocuments(
  siren: string,
  docs: Documents,
  options: { statutsSeulement: boolean; type: 'tous' | 'actes' | 'comptes' },
): string {
  const parties: string[] = [`# Documents déposés au RNE — SIREN ${siren}`];

  if (options.type !== 'comptes') {
    const actes = options.statutsSeulement ? docs.actes.filter((a) => a.contientStatuts) : docs.actes;
    const inconnus = docs.actes.filter((a) => a.natureInconnue).length;
    const entete = options.statutsSeulement
      ? `## Actes contenant des statuts (${actes.length} sur ${docs.actes.length} actes)`
      : `## Actes (${actes.length})`;
    const lignesActes = actes.map(
      (a) =>
        `- ${a.dateDepot ? `Déposé le ${dateFr(a.dateDepot)}` : 'Date de dépôt non renseignée'} — ` +
        `${a.types.length ? a.types.join(' ; ') : 'nature non précisée par le RNE'}` +
        `${a.decisions.length ? ` (décisions : ${a.decisions.join(' ; ')})` : ''}` +
        `${a.confidentiel ? ' — confidentiel' : ''} — identifiant \`${a.id}\``,
    );
    const noteInconnus =
      options.statutsSeulement && inconnus
        ? `\n\n_${inconnus} acte(s) ancien(s) ne portent aucune indication de nature dans le RNE : ils peuvent contenir des statuts sans que le filtre puisse le détecter. Relancez sans filtre pour les voir._`
        : '';
    parties.push(`${entete}\n\n${lignesActes.join('\n') || '_Aucun acte._'}${noteInconnus}`);
  }

  if (options.type !== 'actes') {
    const lignesComptes = docs.comptes.map(
      (c) =>
        `- Exercice clos le ${dateFr(c.dateCloture) ?? '?'} — ${c.libelleType ?? 'type non précisé'}` +
        `${c.dateDepot ? `, déposés le ${dateFr(c.dateDepot)}` : ''}${c.confidentiel ? ' — confidentiels' : ''}` +
        `${c.idSaisie ? ' — chiffres clés disponibles' : ''} — identifiant \`${c.id}\``,
    );
    parties.push(`## Comptes annuels (${docs.comptes.length})\n\n${lignesComptes.join('\n') || '_Aucun dépôt de comptes._'}`);
  }

  parties.push(
    'Pour obtenir un PDF, utilisez `telecharger_document_entreprise` avec le type (acte ou comptes) et l’identifiant. ' +
      'Pour les chiffres clés, utilisez `chiffres_cles_comptes`.',
  );
  return parties.join('\n\n');
}

export function formaterChiffresCles(siren: string, c: ChiffresCles): string {
  const devise = c.devise ?? 'EUR';
  const enTete = lignes(
    `# Chiffres clés — ${c.denomination ?? `SIREN ${siren}`}`,
    '',
    champ('SIREN', siren),
    champ('Nature des comptes', c.nature === 'consolides' ? 'Comptes consolidés (groupe)' : 'Comptes sociaux (société seule)'),
    champ('Type de comptes', c.libelleType),
    champ('Exercice clos le', dateFr(c.dateCloture)),
    champ("Durée de l'exercice", c.dureeMois !== undefined ? `${c.dureeMois} mois` : undefined),
    champ('Exercice précédent clos le', dateFr(c.dateCloturePrecedente)),
    champ("Durée de l'exercice précédent", c.dureeMoisPrecedente !== undefined ? `${c.dureeMoisPrecedente} mois` : undefined),
    champ('Date de dépôt', dateFr(c.dateDepot)),
    champ('Confidentialité', c.confidentialite),
  );
  if (!c.postes.length) {
    return `${enTete}\n\n${c.avertissement ?? 'Aucune donnée chiffrée disponible pour ces comptes.'}`;
  }
  const tableau = [
    `| Poste | Exercice ${c.annee ?? '?'} | Exercice ${c.anneePrecedente ?? 'précédent'} |`,
    '|---|---:|---:|',
    ...c.postes.map((p) => {
      const fmt = (v?: number) =>
        v === undefined ? '—' : p.libelle.startsWith('Effectif') ? String(v) : montant(v, devise);
      return `| ${p.libelle} | ${fmt(p.n)} | ${fmt(p.n1)} |`;
    }),
  ].join('\n');
  const notes = c.postes
    .filter((p) => p.note)
    .map((p) => `- ${p.libelle} : ${p.note}.`)
    .join('\n');
  return [
    enTete,
    tableau,
    notes && `Précisions :\n${notes}`,
    c.avertissement,
    'Montants tels que saisis par l’INPI à partir de la liasse fiscale déposée ; « — » signifie que le poste n’est pas renseigné.',
  ]
    .filter(Boolean)
    .join('\n\n');
}

export function formaterListeEntreprises(
  resultats: FicheEntreprise[],
  total: number | undefined,
  page: number,
  taille: number,
  recherche: string,
): string {
  if (!resultats.length) {
    return `# Aucune entreprise trouvée\n\nLe RNE a bien répondu et ne contient aucune entreprise correspondant à « ${recherche} ».`;
  }
  const debut = (page - 1) * taille + 1;
  const lignesRes = resultats.map(
    (f) =>
      `- **${f.denomination ?? '(dénomination non renseignée)'}** — SIREN ${f.siren}` +
      `${f.formeJuridique ? ` — ${f.formeJuridique}` : ''}${f.siege ? ` — ${f.siege}` : ''}` +
      `${f.dateCessation ? ` — cessation le ${dateFr(f.dateCessation)}` : ''}`,
  );
  const suite = total !== undefined && debut + resultats.length - 1 < total ? `\n\nPage suivante : \`page: ${page + 1}\`.` : '';
  return (
    `# ${total ?? resultats.length} entreprise(s) trouvée(s) pour « ${recherche} » — résultats ${debut} à ${debut + resultats.length - 1}\n\n` +
    `${lignesRes.join('\n')}${suite}\n\nPour la fiche complète, utilisez \`fiche_entreprise\` avec le SIREN.`
  );
}
