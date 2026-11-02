// Outils génériques de lecture des notices XML de l'INPI.
//
// Les notices enveloppent souvent leurs valeurs dans des sections CDATA
// (<![CDATA[...]]>). Un analyseur naïf les ignore, ce qui fait disparaître
// le nom de la marque ou le titulaire. L'analyseur est donc configuré pour
// fusionner le contenu des sections CDATA dans le texte de l'élément, et
// toutes les valeurs sont conservées sous forme de chaînes (un numéro de
// classe « 09 » ou un SIREN commençant par 0 ne doit pas devenir un nombre).

import { XMLParser } from 'fast-xml-parser';

export type Noeud = Record<string, unknown>;

const analyseur = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@',
  textNodeName: '#text',
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: true,
  // Pas de cdataPropName : le contenu CDATA est fusionné dans le texte.
  processEntities: true,
  htmlEntities: true,
  removeNSPrefix: false,
});

/** Analyse un document XML en objet JavaScript. */
export function analyserXML(xml: string): Noeud {
  return analyseur.parse(xml) as Noeud;
}

/** Renvoie toujours un tableau (élément unique, absent ou déjà multiple). */
export function liste<T = unknown>(valeur: unknown): T[] {
  if (valeur === undefined || valeur === null || valeur === '') return [];
  return (Array.isArray(valeur) ? valeur : [valeur]) as T[];
}

/** Suit un chemin « A.B.C » ; en présence d'un tableau, prend le premier élément. */
export function sous(noeud: unknown, chemin: string): unknown {
  let courant: unknown = noeud;
  for (const cle of chemin.split('.')) {
    if (Array.isArray(courant)) courant = courant[0];
    if (courant === null || typeof courant !== 'object') return undefined;
    courant = (courant as Noeud)[cle];
  }
  return courant;
}

/** Renvoie tous les nœuds atteints par un chemin, en dépliant les tableaux. */
export function tous(noeud: unknown, chemin: string): unknown[] {
  let courants: unknown[] = [noeud];
  for (const cle of chemin.split('.')) {
    const suivants: unknown[] = [];
    for (const c of courants) {
      for (const element of liste(c)) {
        if (element && typeof element === 'object') suivants.push(...liste((element as Noeud)[cle]));
      }
    }
    courants = suivants;
  }
  return courants;
}

/** Texte d'un nœud : chaîne simple, ou contenu « #text » d'un élément à attributs. */
export function texte(noeud: unknown): string | undefined {
  if (noeud === undefined || noeud === null) return undefined;
  if (Array.isArray(noeud)) return texte(noeud[0]);
  if (typeof noeud === 'string') return noeud.trim() || undefined;
  if (typeof noeud === 'number' || typeof noeud === 'boolean') return String(noeud);
  if (typeof noeud === 'object') return texte((noeud as Noeud)['#text']);
  return undefined;
}

/** Raccourci : texte du nœud situé au bout d'un chemin. */
export function texteDe(noeud: unknown, chemin: string): string | undefined {
  return texte(sous(noeud, chemin));
}

/** Valeur d'un attribut (sans le préfixe @). */
export function attribut(noeud: unknown, nom: string): string | undefined {
  if (Array.isArray(noeud)) return attribut(noeud[0], nom);
  if (!noeud || typeof noeud !== 'object') return undefined;
  const v = (noeud as Noeud)[`@${nom}`];
  return typeof v === 'string' ? v : undefined;
}

/** Normalise les espaces (tabulations, retours à la ligne multiples). */
export function espaces(valeur: string | undefined): string | undefined {
  return valeur?.replace(/\s+/g, ' ').trim() || undefined;
}
