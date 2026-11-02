// Mise en forme Markdown d'une fiche de marque et d'une liste de résultats.

import type { ClasseProduits, FicheMarque, Inscription } from '../analyseurs/marque.js';
import { personneEnLigne, type Personne } from '../analyseurs/personnes.js';
import { champTexte, type PageResultats } from '../analyseurs/recherche.js';
import { champ, dateFr, lignes } from '../presentation.js';

const OFFICES: Record<string, string> = {
  FR: 'Marque française (INPI)',
  EU: "Marque de l'Union européenne (EUIPO)",
  WO: 'Marque internationale (OMPI)',
};

const BULLETINS: Record<string, string> = {
  FR: 'BOPI',
  EU: "Bulletin des marques de l'UE",
  WO: 'Gazette OMPI',
};

/**
 * Lien vers la fiche publique de la marque sur data.inpi.fr, qui désigne les
 * marques de l'Union européenne par le préfixe EM et un numéro à 9 chiffres.
 */
export function lienMarque(reference: string): string {
  const m = /^EU(\d+)$/.exec(reference);
  const id = m?.[1] ? `EM${m[1].padStart(9, '0')}` : reference;
  return `https://data.inpi.fr/marques/${encodeURIComponent(id)}`;
}

export function formaterFicheMarque(f: FicheMarque): string {
  const prefixe = f.reference.slice(0, 2);
  const bulletin = BULLETINS[prefixe] ?? 'Bulletin officiel';
  const sections: string[] = [];

  sections.push(
    lignes(
      `# Marque ${f.nom ? `« ${f.nom} »` : '(sans élément verbal)'} — ${f.reference}`,
      '',
      champ('Office', OFFICES[prefixe] ?? f.office),
      champ('Numéro', f.numero),
      champ('Type de marque', f.type),
      champ('Nature', f.nature),
      champ('Statut', f.statut),
      champ('Date du statut', dateFr(f.dateStatut)),
      champ('Date de dépôt', dateFr(f.dateDepot)),
      champ("Date d'enregistrement", dateFr(f.dateEnregistrement)),
      champ("Date d'expiration", dateFr(f.dateExpiration)),
      f.renouvellement &&
        champ(
          'Période de renouvellement',
          `du ${dateFr(f.renouvellement.debut) ?? '?'} au ${dateFr(f.renouvellement.fin) ?? '?'}`,
        ),
      champ("Nombre d'oppositions", f.nombreOppositions),
      champ('Lieu de dépôt', f.lieuDepot),
      champ('Langue de dépôt', f.langue),
      champ("Office d'origine", f.officeOrigine),
      f.enregistrementDeBase &&
        champ(
          'Enregistrement ou demande de base',
          [f.enregistrementDeBase.numero, f.enregistrementDeBase.date && `du ${dateFr(f.enregistrementDeBase.date)}`]
            .filter(Boolean)
            .join(' '),
        ),
      champ('Description', f.description),
    ),
  );

  // Titulaire actuel, déposant d'origine, mandataire.
  const titulaires = f.titulairesActuels.length
    ? listePersonnes(f.titulairesActuels)
    : f.reference.startsWith('FR')
      ? titulaireAbsent(f)
      : '_Pour les marques EU et WO, la notice désigne le titulaire comme déposant ci-dessous._';
  sections.push(`## Titulaire actuel\n\n${titulaires}`);
  sections.push(`## Déposant d'origine\n\n${listePersonnes(f.deposants) || '_Non renseigné._'}`);
  sections.push(`## Mandataire\n\n${listePersonnes(f.mandataires) || '_Aucun mandataire indiqué._'}`);

  sections.push(
    `## Produits et services${f.classificationNice ? ` (classification de Nice, édition ${f.classificationNice})` : ''}\n\n` +
      (f.classes.length ? formaterClasses(f.classes) : '_Aucun libellé dans la notice._'),
  );

  if (f.codesVienne.length) sections.push(`## Codes de Vienne (éléments figuratifs)\n\n${f.codesVienne.join(', ')}`);
  if (f.priorites.length) {
    sections.push(
      `## Priorités\n\n${f.priorites
        .map((p) => `- ${[p.pays, p.numero, p.date && `du ${dateFr(p.date)}`].filter(Boolean).join(' ')}${p.partielle ? ' (priorité partielle)' : ''}`)
        .join('\n')}`,
    );
  } else {
    sections.push('## Priorités\n\n_Aucune priorité revendiquée dans la notice._');
  }
  if (f.anciennetes.length) {
    sections.push(
      `## Ancienneté revendiquée\n\n${f.anciennetes
        .map((p) => `- ${[p.pays, p.numero, p.date && `du ${dateFr(p.date)}`].filter(Boolean).join(' ')}`)
        .join('\n')}`,
    );
  }
  if (f.paysDesignes.length) sections.push(`## Pays et organisations désignés\n\n${f.paysDesignes.join(', ')}`);

  sections.push(
    `## Publications (${bulletin})\n\n` +
      (f.publications.length
        ? f.publications
            .map(
              (p) =>
                `- ${bulletin} n° ${p.numero}${p.date ? ` du ${dateFr(p.date)}` : ''}${p.section ? `, section ${p.section}` : ''}${p.objet ? ` — ${p.objet}` : ''}`,
            )
            .join('\n')
        : '_Aucune publication dans la notice._'),
  );

  sections.push(
    `## Historique des inscriptions et événements\n\n` +
      (f.inscriptions.length
        ? f.inscriptions.map((i) => formaterInscription(i, bulletin)).join('\n\n')
        : '_Aucune inscription dans la notice._'),
  );

  return sections.join('\n\n');
}

function listePersonnes(personnes: Personne[]): string {
  return personnes.map((p) => `- ${personneEnLigne(p)}`).join('\n');
}

/** Notices FR anciennes : pas de rubrique titulaire actuel, on renvoie à l'historique. */
function titulaireAbsent(f: FicheMarque): string {
  const transmission = [...f.inscriptions]
    .reverse()
    .find((i) => /transmission|cession|fusion|apport/i.test(i.nature) && i.beneficiaires.length);
  const base = "_La notice de l'INPI ne contient pas de rubrique « titulaire actuel » pour cette marque._";
  if (!transmission) return `${base} Aucune inscription de transfert de propriété n'y figure ; voir le déposant et l'historique ci-dessous.`;
  return (
    `${base} Dernière inscription de transfert de propriété (« ${transmission.nature} », déposée le ` +
    `${dateFr(transmission.dateDepot) ?? '?'}) au profit de :\n${listePersonnes(transmission.beneficiaires)}`
  );
}

function formaterClasses(classes: ClasseProduits[]): string {
  return classes
    .map((c) => (c.numero && c.numero !== '00' ? `### Classe ${Number(c.numero)}\n\n${c.libelle}` : c.libelle))
    .join('\n\n');
}

function formaterInscription(i: Inscription, bulletin: string): string {
  const titre = [dateFr(i.dateDepot) ?? dateFr(i.publications[0]?.date), i.nature].filter(Boolean).join(' — ');
  const contenu = lignes(
    `### ${titre}`,
    champ('Catégorie', i.categorie),
    champ("Numéro d'inscription", i.reference),
    champ("Date d'effet", dateFr(i.dateEffet)),
    champ('Statut', i.statut),
    champ('Office concerné', i.office),
    i.publications.length > 0 &&
      champ(
        'Publication',
        i.publications.map((p) => `${bulletin} n° ${p.numero}${p.date ? ` du ${dateFr(p.date)}` : ''}`).join(' ; '),
      ),
    i.beneficiaires.length > 0 && `- **Bénéficiaire(s)** :\n${i.beneficiaires.map((b) => `  - ${personneEnLigne(b)}`).join('\n')}`,
    i.paysDesignes.length > 0 && champ('Pays désignés', i.paysDesignes.join(', ')),
    i.libellesApresLimitation.length > 0 &&
      `- **Libellés après limitation** :\n\n${i.libellesApresLimitation
        .map((c) => (c.numero && c.numero !== '00' ? `  Classe ${Number(c.numero)} : ${c.libelle}` : `  ${c.libelle}`))
        .join('\n\n')}`,
  );
  return contenu;
}

export function formaterResultatsMarques(page: PageResultats, requete: string, taille: number): string {
  const debut = page.position + 1;
  const fin = page.position + page.resultats.length;
  const entete =
    page.total === 0
      ? `# Aucune marque trouvée\n\nRequête envoyée à l'INPI : \`${requete}\`\n\nL'INPI a bien répondu et ne contient aucune marque correspondant à ces critères.`
      : `# ${page.total} marque(s) trouvée(s) — résultats ${debut} à ${fin}\n\nRequête envoyée à l'INPI : \`${requete}\``;
  const lignesResultats = page.resultats.map((r) => {
    const c = r.champs;
    const classes = c.ClassNumber ? (Array.isArray(c.ClassNumber) ? c.ClassNumber : [c.ClassNumber]) : [];
    const details = [
      champTexte(c, 'MarkCurrentStatusCode'),
      champTexte(c, 'DEPOSANT') && `déposant : ${champTexte(c, 'DEPOSANT')}`,
      classes.length ? `classes ${classes.map((n) => Number(n)).join(', ')}` : undefined,
      champTexte(c, 'ApplicationDate') && `déposée le ${dateFr(champTexte(c, 'ApplicationDate'))}`,
      champTexte(c, 'ExpiryDate') && `expire le ${dateFr(champTexte(c, 'ExpiryDate'))}`,
    ].filter(Boolean);
    return `- **${champTexte(c, 'Mark') ?? '(sans élément verbal)'}** — ${r.reference} — ${details.join(' ; ')}`;
  });
  const suite =
    fin < page.total
      ? `\n\nPour la suite, relancez la recherche avec \`position: ${fin}\` (au plus ${taille} résultats par page).`
      : '';
  return `${entete}${lignesResultats.length ? `\n\n${lignesResultats.join('\n')}` : ''}${suite}\n\nPour la fiche complète d'une marque, utilisez \`fiche_marque\` avec son numéro (par exemple ${page.resultats[0]?.reference ?? 'FR4020655'}).`;
}
