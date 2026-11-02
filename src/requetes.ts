// Construction des requêtes de recherche au format propre à l'INPI.
//
// Syntaxe : [CHAMP=valeur], combinée par les opérateurs ET, OU et SAUF.
// Plages de dates : [CHAMP=AAAAMMJJ:AAAAMMJJ]. Jokers : * et ?.
// Une valeur de plusieurs mots doit être placée entre guillemets, faute de
// quoi l'INPI recherche chacun des mots séparément.

import { ParametreInvalide } from './erreurs.js';

/** Nettoie une valeur saisie par l'utilisateur pour l'insérer dans un critère. */
export function valeurCritere(brute: string): string {
  const v = brute.replace(/[[\]"]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!v) throw new ParametreInvalide('Un critère de recherche est vide.');
  return /\s/.test(v) ? `"${v}"` : v;
}

/** Critère simple [CHAMP=valeur]. */
export function critere(champ: string, valeur: string): string {
  return `[${champ}=${valeurCritere(valeur)}]`;
}

/** Critère portant sur plusieurs valeurs possibles : [CHAMP=(a OU b)]. */
export function critereOu(champ: string, valeurs: Array<string | number>): string {
  const propres = valeurs.map((v) => valeurCritere(String(v)));
  if (propres.length === 1) return `[${champ}=${propres[0]}]`;
  return `[${champ}=(${propres.join(' OU ')})]`;
}

/** Convertit AAAA-MM-JJ, JJ/MM/AAAA ou AAAAMMJJ en AAAAMMJJ. */
export function dateCompacte(valeur: string): string {
  const v = valeur.trim();
  let m = /^(\d{4})-?(\d{2})-?(\d{2})$/.exec(v);
  if (m) return `${m[1]}${m[2]}${m[3]}`;
  m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(v);
  if (m) return `${m[3]}${m[2]}${m[1]}`;
  m = /^(\d{4})$/.exec(v);
  if (m) return `${m[1]}0101`;
  throw new ParametreInvalide(`Date non reconnue : « ${valeur} ». Utilisez le format AAAA-MM-JJ.`);
}

/** Critère de plage de dates ; une borne absente reste ouverte. */
export function critereDates(champ: string, debut?: string, fin?: string): string | undefined {
  if (!debut && !fin) return undefined;
  const d = debut ? dateCompacte(debut) : '00000101';
  const f = fin ? dateCompacte(fin) : '99991231';
  return `[${champ}=${d}:${f}]`;
}

/** Date du jour au format AAAAMMJJ (fuseau de Paris). */
export function aujourdhui(maintenant = new Date()): string {
  return maintenant
    .toLocaleDateString('fr-CA', { timeZone: 'Europe/Paris' })
    .replace(/-/g, '');
}

/** Assemble des critères avec l'opérateur ET. */
export function combiner(criteres: Array<string | undefined>): string {
  const presents = criteres.filter((c): c is string => Boolean(c));
  if (!presents.length) {
    throw new ParametreInvalide('Indiquez au moins un critère de recherche.');
  }
  return presents.join(' ET ');
}
