// Lecture des réponses JSON de recherche de l'API Propriété industrielle.

import type { ReponseRecherchePI } from '../api/pi.js';

export interface ResultatRecherche {
  /** Numéro préfixé de l'office, tel qu'attendu par l'API des notices. */
  reference: string;
  champs: Record<string, string | string[]>;
}

export interface PageResultats {
  total: number;
  position: number;
  resultats: ResultatRecherche[];
}

/** Décode les entités HTML que l'INPI laisse dans certains libellés (&apos;, &#233;…). */
export function decoderEntites(texte: string): string {
  const nommees: Record<string, string> = { amp: '&', apos: "'", quot: '"', lt: '<', gt: '>', nbsp: ' ' };
  return texte.replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (tout, code: string) => {
    if (code[0] === '#') {
      const n = code[1] === 'x' || code[1] === 'X' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : tout;
    }
    return nommees[code.toLowerCase()] ?? tout;
  });
}

/** Préfixe d'office déduit de la clé interne ukey (FMARK|…, CTMARK|…, TMINT|…). */
const PREFIXES_UKEY: Record<string, string> = { FMARK: 'FR', CTMARK: 'EU', TMINT: 'WO' };

export function lirePageResultats(reponse: ReponseRecherchePI): PageResultats {
  return {
    total: reponse.metadata.count,
    position: reponse.metadata.position,
    resultats: reponse.results.map((r) => {
      const champs: Record<string, string | string[]> = {};
      for (const f of r.fields ?? []) {
        if (f.name in champs) continue;
        if (f.values) champs[f.name] = f.values.map(decoderEntites);
        else if (f.value !== null && f.value !== undefined) champs[f.name] = decoderEntites(f.value);
      }
      return { reference: referenceDe(r, champs), champs };
    }),
  };
}

function referenceDe(r: ReponseRecherchePI['results'][number], champs: Record<string, string | string[]>): string {
  // Le lien vers la notice porte le numéro complet attendu par l'API.
  const href = r.xml?.href;
  if (href) {
    const dernier = href.split('/').filter(Boolean).pop();
    if (dernier) return decodeURIComponent(dernier);
  }
  const ukey = typeof champs.ukey === 'string' ? champs.ukey : '';
  const [type, numero] = ukey.split('|');
  const prefixe = type ? PREFIXES_UKEY[type] : undefined;
  return prefixe && numero ? `${prefixe}${numero}` : r.documentId;
}

/** Premier texte d'un champ (valeur simple ou première valeur multiple). */
export function champTexte(champs: Record<string, string | string[]>, nom: string): string | undefined {
  const v = champs[nom];
  return Array.isArray(v) ? v.join(', ') : v;
}
