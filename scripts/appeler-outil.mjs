// Utilitaire de développement : lance le serveur compilé et appelle un ou plusieurs outils
// dans la même session (une seule connexion à l'INPI pour toute la série).
//
// Usage :
//   node scripts/appeler-outil.mjs                          liste les outils
//   node scripts/appeler-outil.mjs <outil> '<arguments>'    appelle un outil
//   node scripts/appeler-outil.mjs --serie fichier.json     appelle une série d'outils
//     (fichier JSON : [{ "outil": "...", "arguments": { ... } }, ...])
// Les identifiants sont lus dans l'environnement (INPI_EMAIL, INPI_MOT_DE_PASSE).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const [premier, second = '{}'] = process.argv.slice(2);
const appels =
  premier === '--serie'
    ? JSON.parse(readFileSync(second, 'utf8'))
    : premier
      ? [{ outil: premier, arguments: JSON.parse(second) }]
      : [];

const transport = new StdioClientTransport({
  command: process.execPath,
  args: [fileURLToPath(new URL('../dist/index.js', import.meta.url))],
  env: { ...process.env, INPI_JOURNAL: process.env.INPI_JOURNAL ?? 'info' },
  stderr: 'inherit',
});
const client = new Client({ name: 'essai', version: '0.0.0' });
await client.connect(transport);
if (!appels.length) {
  const { tools } = await client.listTools();
  for (const t of tools) console.log(`${t.name} — ${t.description}`);
}
for (const appel of appels) {
  console.log(`\n>>>>> ${appel.outil} ${JSON.stringify(appel.arguments)}\n`);
  const r = await client.callTool({ name: appel.outil, arguments: appel.arguments }, undefined, { timeout: 300_000 });
  for (const c of r.content) if (c.type === 'text') console.log(c.text);
  if (r.isError) console.log('[isError]');
}
await client.close();
