#!/usr/bin/env node
// Point d'entrée : démarre le serveur MCP sur l'entrée et la sortie standard.

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { journal } from './journal.js';
import { creerServeur } from './serveur.js';

async function demarrer(): Promise<void> {
  const serveur = creerServeur();
  await serveur.connect(new StdioServerTransport());
  journal.info('serveur démarré');
}

demarrer().catch((e: unknown) => {
  journal.erreur(`échec du démarrage : ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});
