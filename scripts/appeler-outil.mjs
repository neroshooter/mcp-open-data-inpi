// Petit utilitaire de développement : lance le serveur compilé et appelle un outil.
// Usage : node scripts/appeler-outil.mjs <outil> '<arguments JSON>'
// Les identifiants sont lus dans l'environnement (INPI_EMAIL, INPI_MOT_DE_PASSE).
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { fileURLToPath } from 'node:url';

const [outil, args = '{}'] = process.argv.slice(2);
const transport = new StdioClientTransport({
  command: process.execPath,
  args: [fileURLToPath(new URL('../dist/index.js', import.meta.url))],
  env: { ...process.env, INPI_JOURNAL: process.env.INPI_JOURNAL ?? 'info' },
  stderr: 'inherit',
});
const client = new Client({ name: 'essai', version: '0.0.0' });
await client.connect(transport);
if (!outil) {
  const { tools } = await client.listTools();
  for (const t of tools) console.log(`${t.name} — ${t.description}`);
} else {
  const r = await client.callTool({ name: outil, arguments: JSON.parse(args) });
  for (const c of r.content) if (c.type === 'text') console.log(c.text);
  if (r.isError) console.log('[isError]');
}
await client.close();
