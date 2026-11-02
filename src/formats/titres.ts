// Mise en forme Markdown des fiches et résultats de brevets et de dessins et modèles.

import type { FicheBrevet, PersonneBrevet, ReferenceDocument } from '../analyseurs/brevet.js';
import type { FicheModele } from '../analyseurs/modele.js';
import { personneEnLigne } from '../analyseurs/personnes.js';
import { champTexte, type PageResultats } from '../analyseurs/recherche.js';
import { champ, dateFr, lignes } from '../presentation.js';

export function lienBrevet(reference: string): string {
  return `https://data.inpi.fr/brevets/${encodeURIComponent(reference)}`;
}

/** data.inpi.fr présente chaque modèle d'un dépôt sous son numéro de séquence (FR20140182-001). */
export function lienModele(reference: string, sequence = '001'): string {
  return `https://data.inpi.fr/dessins_modeles/${encodeURIComponent(`${reference}-${sequence.padStart(3, '0')}`)}`;
}


function refEnLigne(r: ReferenceDocument): string | undefined {
  const t = [r.pays && r.numero ? `${r.pays}${r.numero}` : r.numero, r.code, r.date && `du ${dateFr(r.date)}`]
    .filter(Boolean)
    .join(' ');
  return t || undefined;
}

function partiesEnListe(p: PersonneBrevet[]): string {
  return p
    .map((x) => `- ${x.nom}${x.siren ? ` (SIREN ${x.siren})` : ''}${x.adresse ? ` — ${x.adresse}` : ''}${x.pays && !x.adresse?.includes(x.pays) ? ` (${x.pays})` : ''}`)
    .join('\n');
}

export function formaterFicheBrevet(f: FicheBrevet): string {
  const sections = [
    lignes(
      `# Brevet ${f.reference}${f.titre ? ` — ${f.titre}` : ''}`,
      '',
      champ('Nature', f.nature),
      champ('Statut', f.statut),
      champ('Statut au registre européen (OEB)', f.statutOEB),
      champ('Publication', [refEnLigne(f.publication), f.publication.bopi && `(BOPI ${f.publication.bopi})`].filter(Boolean).join(' ') || undefined),
      champ('Dépôt', refEnLigne(f.depot)),
      champ('Langue de dépôt', f.langueDepot),
      champ('Famille de brevets (identifiant OEB)', f.famille),
      f.titresAutresLangues.length > 0 && champ('Titre dans les autres langues', f.titresAutresLangues.join(' ; ')),
    ),
    `## Abrégé${f.langueAbrege && f.langueAbrege !== 'fr' ? ` (langue : ${f.langueAbrege})` : ''}\n\n${f.abrege ?? '_Aucun abrégé dans la notice._'}`,
    `## Titulaires\n\n${partiesEnListe(f.titulaires) || '_Non renseigné dans la notice._'}`,
    `## Déposants\n\n${partiesEnListe(f.deposants) || '_Non renseigné._'}`,
    `## Inventeurs\n\n${partiesEnListe(f.inventeurs) || '_Non renseigné._'}`,
    `## Mandataire\n\n${partiesEnListe(f.mandataires) || '_Aucun mandataire indiqué._'}`,
    `## Priorités\n\n${f.priorites.map((p) => `- ${refEnLigne(p)}`).join('\n') || '_Aucune priorité revendiquée._'}`,
    `## Classifications\n\n${
      lignes(
        champ('CIB', f.classificationsCIB.join(' ; ') || undefined),
        champ('CPC', f.classificationsCPC.join(' ; ') || undefined),
      ) || '_Non renseignées._'
    }`,
  ];
  if (f.etatsDesignes.length) sections.push(`## États désignés\n\n${f.etatsDesignes.join(', ')}`);
  sections.push(
    `## Procédure, annuités et délivrance\n\n${
      [
        ...f.datesProcedure.map(
          (d) =>
            `- ${d.libelle}${d.date ? ` : ${dateFr(d.date)}` : ''}${d.precision ? ` (${d.precision})` : ''}${d.bopi ? ` — BOPI ${d.bopi}` : ''}`,
        ),
        ...f.mentions.map((m) => `- ${m}`),
      ].join('\n') || '_Aucune date de procédure dans la notice._'
    }`,
  );
  sections.push(
    `## Inscriptions au Registre national des brevets\n\n${
      f.inscriptions
        .map(
          (i) =>
            `- ${i.date ? `${dateFr(i.date)} — ` : ''}${i.nature}${i.numero ? ` (inscription n° ${i.numero})` : ''}${i.bopi ? ` — BOPI ${i.bopi}` : ''}`,
        )
        .join('\n') || '_Aucune inscription dans la notice._'
    }`,
  );
  if (f.citations.length) sections.push(`## Documents cités\n\n${f.citations.map((c) => `- ${c}`).join('\n')}`);
  return sections.join('\n\n');
}

export function formaterFicheModele(f: FicheModele): string {
  const sections = [
    lignes(
      `# Dessins et modèles ${f.reference}`,
      '',
      champ('Office', f.office === 'WO' ? 'Dépôt international (OMPI, Arrangement de La Haye)' : f.office === 'FR' ? 'Dépôt français (INPI)' : f.office),
      champ('Numéro de dépôt', f.numeroDepot),
      champ('Date de dépôt', dateFr(f.dateDepot)),
      champ('Lieu de dépôt', f.lieuDepot),
      champ('Nombre de modèles dans le dépôt', f.nombreModeles),
      f.depotSousPliScelle && champ('Dépôt sous pli scellé', 'oui'),
      f.paysDesignes.length > 0 && champ('Pays désignés', f.paysDesignes.join(', ')),
    ),
    ...f.modeles.map((m) =>
      lignes(
        `## Modèle ${m.numero ?? ''}${m.titre ? ` — ${m.titre}` : ''}`,
        '',
        champ("Numéro d'enregistrement", m.numeroEnregistrement),
        champ('Statut', m.statut),
        champ("Date d'expiration", dateFr(m.dateExpiration)),
        champ('Description', m.description),
        champ('Classification de Locarno', m.classesLocarno.join(', ') || undefined),
        champ('Nombre de reproductions', m.nombreReproductions),
        m.reproductions.length > 0 && champ('Reproductions', m.reproductions.join(' ; ')),
        m.createurs.length > 0 && `- **Créateur(s)** :\n${m.createurs.map((p) => `  - ${personneEnLigne(p)}`).join('\n')}`,
        '',
        '### Inscriptions et publications',
        '',
        m.inscriptions
          .map(
            (i) =>
              `- ${i.date ? `${dateFr(i.date)} — ` : ''}${i.nature}${i.publication ? ` — publication ${[i.publication.numero, i.publication.date && `du ${dateFr(i.publication.date)}`].filter(Boolean).join(' ')}` : ''}` +
              `${i.commentaire ? ` (${i.commentaire})` : ''}${i.pays.length ? ` — pays : ${i.pays.join(', ')}` : ''}` +
              `${i.beneficiaires.length ? ` — au profit de ${i.beneficiaires.map(personneEnLigne).join(' ; ')}` : ''}`,
          )
          .join('\n') || '_Aucune inscription._',
      ),
    ),
    `## Déposants\n\n${f.deposants.map((p) => `- ${personneEnLigne(p)}`).join('\n') || '_Non renseigné._'}`,
    `## Mandataires\n\n${f.mandataires.map((p) => `- ${personneEnLigne(p)}${p.mention ? ` (${p.mention})` : ''}`).join('\n') || '_Aucun mandataire indiqué._'}`,
  ];
  if (f.priorites.length) {
    sections.push(
      `## Priorités\n\n${f.priorites.map((p) => `- ${[p.pays, p.numero, p.date && `du ${dateFr(p.date)}`].filter(Boolean).join(' ')}`).join('\n')}`,
    );
  }
  if (f.nombreModeles && f.nombreModeles > 1) {
    sections.push(
      `_Ce dépôt compte ${f.nombreModeles} modèles. L'API de l'INPI ne restitue que la notice détaillée du premier ; ` +
        `les autres sont consultables sur data.inpi.fr (numéro du dépôt suivi de -002, -003…)._`,
    );
  }
  return sections.join('\n\n');
}

/** Liste de résultats générique : chaque famille précise les champs à afficher. */
export function formaterResultats(
  page: PageResultats,
  requete: string,
  options: { quoi: string; titre: string; details: Array<[string, string]>; outilFiche: string },
): string {
  const debut = page.position + 1;
  const fin = page.position + page.resultats.length;
  if (page.total === 0) {
    return `# Aucun résultat\n\nRequête envoyée à l'INPI : \`${requete}\`\n\nL'INPI a bien répondu et ne contient aucun ${options.quoi} correspondant à ces critères.`;
  }
  const lignesRes = page.resultats.map((r) => {
    const details = options.details
      .map(([nom, libelle]) => {
        const v = champTexte(r.champs, nom);
        return v ? `${libelle} : ${/DATE|PUBD|DEPD|Date$/i.test(nom) ? dateFr(v) : v}` : undefined;
      })
      .filter(Boolean);
    return `- **${champTexte(r.champs, options.titre) ?? '(sans titre)'}** — ${r.reference}${details.length ? ` — ${details.join(' ; ')}` : ''}`;
  });
  const suite = fin < page.total ? `\n\nPour la suite, relancez la recherche avec \`position: ${fin}\`.` : '';
  return (
    `# ${page.total} résultat(s) — ${debut} à ${fin}\n\nRequête envoyée à l'INPI : \`${requete}\`\n\n${lignesRes.join('\n')}${suite}` +
    `\n\nPour le détail, utilisez \`${options.outilFiche}\` avec le numéro indiqué.`
  );
}
