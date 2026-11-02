// Fonctions communes aux tests unitaires.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/** Lit un jeu de données anonymisé de tests/jeux-de-donnees. */
export function jeu(nom: string): string {
  return readFileSync(fileURLToPath(new URL(`../jeux-de-donnees/${nom}`, import.meta.url)), 'utf8');
}

export function jeuJSON<T = unknown>(nom: string): T {
  return JSON.parse(jeu(nom)) as T;
}

/** Réponse HTTP factice pour simuler l'INPI sans réseau. */
export function reponseFactice(
  statut: number,
  corps: string | object = '',
  entetes: Record<string, string | string[]> = {},
): Response {
  const h = new Headers();
  for (const [k, v] of Object.entries(entetes)) {
    for (const valeur of Array.isArray(v) ? v : [v]) h.append(k, valeur);
  }
  const texte = typeof corps === 'string' ? corps : JSON.stringify(corps);
  return new Response(statut === 204 ? null : texte, { status: statut, headers: h });
}
