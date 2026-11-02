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
      champ('Publication', refEnLigne(f.publication)),
      champ('Dépôt', refEnLigne(f.depot)),
      champ('Date de délivrance', dateFr(f.dateDelivrance)),
      champ('Statut', f.statut),
      f.titresAutresLangues.length > 0 && champ('Titre dans les autres langues', f.titresAutresLangues.join(' ; ')),
    ),
    `## Abrégé\n\n${f.abrege ?? '_Aucun abrégé dans la notice._'}`,
    `## Déposants\n\n${partiesEnListe(f.deposants) || '_Non renseigné._'}`,
  ];
  if (f.titulaires.length) sections.push(`## Titulaires\n\n${partiesEnListe(f.titulaires)}`);
  sections.push(`## Inventeurs\n\n${partiesEnListe(f.inventeurs) || '_Non renseigné._'}`);
  sections.push(`## Mandataire\n\n${partiesEnListe(f.mandataires) || '_Aucun mandataire indiqué._'}`);
  sections.push(
    `## Priorités\n\n${f.priorites.map((p) => `- ${refEnLigne(p)}`).join('\n') || '_Aucune priorité revendiquée._'}`,
  );
  sections.push(
    `## Classifications\n\n${lignes(
      champ('CIB', f.classificationsCIB.join(' ; ') || undefined),
      champ('CPC', f.classificationsCPC.join(' ; ') || undefined),
    ) || '_Non renseignées._'}`,
  );
  if (f.etatsDesignes.length) sections.push(`## États désignés\n\n${f.etatsDesignes.join(', ')}`);
  sections.push(
    `## Procédure et inscriptions\n\n${
      f.evenements
        .map((e) => `- ${e.date ? `${dateFr(e.date)} — ` : ''}${e.libelle}${e.details.length ? ` (${e.details.join(' ; ')})` : ''}`)
        .join('\n') || '_Aucun événement de procédure dans la notice._'
    }`,
  );
  return sections.join('\n\n');
}

export function formaterFicheModele(f: FicheModele): string {
  const sections = [
    lignes(
      `# Dessins et modèles ${f.reference}`,
      '',
      champ('Office', f.office),
      champ('Numéro de dépôt', f.numeroDepot),
      champ('Date de dépôt', dateFr(f.dateDepot)),
      champ("Date d'enregistrement", dateFr(f.dateEnregistrement)),
      champ('Date de publication', dateFr(f.datePublication)),
      champ("Date d'expiration", dateFr(f.dateExpiration)),
      champ('Statut', f.statut),
      champ('Ajournement de publication', f.ajournement),
    ),
    `## Modèles du dépôt (${f.modeles.length})\n\n${
      f.modeles
        .map((m) =>
          lignes(
            `### ${m.numero ? `Modèle ${m.numero}` : 'Modèle'}${m.titre ? ` — ${m.titre}` : ''}`,
            champ('Produits', m.produits.join(' ; ') || undefined),
            champ('Classification de Locarno', m.classesLocarno.join(', ') || undefined),
            champ('Nombre de reproductions', m.nombreReproductions),
            champ('Statut', m.statut),
          ),
        )
        .join('\n\n') || '_Aucun modèle détaillé dans la notice._'
    }`,
    `## Déposants\n\n${f.deposants.map((p) => `- ${personneEnLigne(p)}`).join('\n') || '_Non renseigné._'}`,
  ];
  if (f.titulaires.length) sections.push(`## Titulaires\n\n${f.titulaires.map((p) => `- ${personneEnLigne(p)}`).join('\n')}`);
  sections.push(`## Créateurs\n\n${f.createurs.map((p) => `- ${personneEnLigne(p)}`).join('\n') || '_Non renseigné._'}`);
  sections.push(`## Mandataire\n\n${f.mandataires.map((p) => `- ${personneEnLigne(p)}`).join('\n') || '_Aucun mandataire indiqué._'}`);
  sections.push(
    `## Priorités\n\n${
      f.priorites.map((p) => `- ${[p.pays, p.numero, p.date && `du ${dateFr(p.date)}`].filter(Boolean).join(' ')}`).join('\n') ||
      '_Aucune priorité revendiquée._'
    }`,
  );
  sections.push(
    `## Publications\n\n${
      f.publications.map((p) => `- ${[p.numero, p.date && `du ${dateFr(p.date)}`].filter(Boolean).join(' ')}`).join('\n') ||
      '_Aucune publication dans la notice._'
    }`,
  );
  sections.push(
    `## Inscriptions\n\n${
      f.inscriptions
        .map(
          (i) =>
            `- ${i.date ? `${dateFr(i.date)} — ` : ''}${i.nature}${i.reference ? ` (n° ${i.reference})` : ''}` +
            `${i.publication ? `, publiée au BOPI ${i.publication}` : ''}` +
            `${i.beneficiaires.length ? ` — au profit de ${i.beneficiaires.map(personneEnLigne).join(' ; ')}` : ''}`,
        )
        .join('\n') || '_Aucune inscription dans la notice._'
    }`,
  );
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
