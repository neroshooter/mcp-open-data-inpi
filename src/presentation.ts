// Mise en forme des réponses des outils.
//
// Chaque réponse se termine par un pied commun : la source, un lien vers
// data.inpi.fr, la date de consultation et l'avertissement juridique.

export interface Source {
  /** Nom de la source, par exemple « API Propriété industrielle de l'INPI ». */
  nom: string;
  /** Lien vers la page correspondante sur data.inpi.fr. */
  lien?: string;
}

export const AVERTISSEMENT =
  "Seuls les documents officiels publiés par l'INPI font foi. Ce projet est indépendant : " +
  "il n'est ni affilié à l'INPI, ni approuvé par lui.";

/** Ajoute le pied de réponse (source, lien, date, avertissement). */
export function avecPied(corps: string, source: Source, maintenant = new Date()): string {
  const lignes = [
    corps.trimEnd(),
    '',
    '---',
    `Source : ${source.nom}${source.lien ? ` — ${source.lien}` : ''}`,
    `Consulté le ${dateHeure(maintenant)}.`,
    AVERTISSEMENT,
  ];
  return lignes.join('\n');
}

/** Date et heure en français, fuseau de Paris. */
export function dateHeure(d: Date): string {
  return d.toLocaleString('fr-FR', { timeZone: 'Europe/Paris', dateStyle: 'long', timeStyle: 'short' });
}

/**
 * Convertit une date INPI (AAAA-MM-JJ, AAAAMMJJ ou ISO complète) en
 * JJ/MM/AAAA. Renvoie la valeur d'origine si elle n'est pas reconnue.
 */
export function dateFr(valeur: string | null | undefined): string | undefined {
  if (!valeur) return undefined;
  const v = valeur.trim();
  const m = /^(\d{4})-?(\d{2})-?(\d{2})/.exec(v);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : v;
}

/** Formate un montant en euros (ou autre devise) à la française. */
export function montant(valeur: number, devise = 'EUR'): string {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: devise, maximumFractionDigits: 0 })
    .format(valeur)
    .replace(/\u202f/g, ' ');
}

/** Ligne « **Libellé** : valeur », omise si la valeur est vide. */
export function champ(libelle: string, valeur: string | number | undefined | null): string | undefined {
  if (valeur === undefined || valeur === null || valeur === '') return undefined;
  return `- **${libelle}** : ${valeur}`;
}

/** Assemble des lignes en ignorant les valeurs absentes. */
export function lignes(...elements: Array<string | undefined | false | null>): string {
  return elements.filter((e): e is string => typeof e === 'string').join('\n');
}
