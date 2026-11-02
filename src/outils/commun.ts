// Outils communs à tous les outils MCP : contexte partagé et traitement
// uniforme des erreurs.

import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { ClientPI } from '../api/pi.js';
import type { ClientRNE } from '../api/rne.js';
import type { Configuration } from '../config.js';
import { ErreurINPI } from '../erreurs.js';
import { journal, masquer } from '../journal.js';
import { avecPied, type Source } from '../presentation.js';

export interface Contexte {
  config: Configuration;
  pi: ClientPI;
  rne: ClientRNE;
}

/** Résultat textuel d'un outil, avec le pied de réponse. */
export function reponse(texte: string, source: Source): CallToolResult {
  return { content: [{ type: 'text', text: avecPied(texte, source) }] };
}

/**
 * Exécute un outil et convertit toute erreur en réponse d'erreur lisible.
 * Les erreurs inattendues sont journalisées (secrets masqués) et ne
 * divulguent aucun détail interne.
 */
export async function executer(source: Source, action: () => Promise<CallToolResult>): Promise<CallToolResult> {
  try {
    return await action();
  } catch (e) {
    let message: string;
    if (e instanceof ErreurINPI) {
      message = e.message;
    } else {
      journal.erreur(`erreur inattendue : ${masquer(e instanceof Error ? (e.stack ?? e.message) : String(e))}`);
      message = 'Erreur inattendue du serveur. Réessayez ; si le problème persiste, signalez-le sur GitHub.';
    }
    return { isError: true, content: [{ type: 'text', text: avecPied(`Erreur : ${message}`, source) }] };
  }
}
