// Construit l'extension Claude Desktop (.mcpb) à partir du code compilé.
//
// Usage : npm run build && node scripts/construire-mcpb.mjs
// Produit mcp-open-data-inpi-<version>.mcpb à la racine du dépôt.

import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const racine = join(dirname(fileURLToPath(import.meta.url)), '..');
const construction = join(racine, 'mcpb', 'build');
const paquet = JSON.parse(readFileSync(join(racine, 'package.json'), 'utf8'));
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';

rmSync(construction, { recursive: true, force: true });
mkdirSync(construction, { recursive: true });

// Manifeste : la version est reprise de package.json.
const manifeste = JSON.parse(readFileSync(join(racine, 'mcpb', 'manifest.json'), 'utf8'));
manifeste.version = paquet.version;
writeFileSync(join(construction, 'manifest.json'), `${JSON.stringify(manifeste, null, 2)}\n`);

for (const element of ['dist', 'package.json', 'package-lock.json', 'LICENSE', 'README.md']) {
  cpSync(join(racine, element), join(construction, element), { recursive: true });
}

// Dépendances de production uniquement, sans script d'installation.
execFileSync(npm, ['ci', '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund'], { cwd: construction, stdio: 'inherit' });
rmSync(join(construction, 'package-lock.json'));

const sortie = join(racine, `mcp-open-data-inpi-${paquet.version}.mcpb`);
execFileSync(npx, ['mcpb', 'validate', join(construction, 'manifest.json')], { cwd: racine, stdio: 'inherit' });
execFileSync(npx, ['mcpb', 'pack', construction, sortie], { cwd: racine, stdio: 'inherit' });
console.log(`Extension construite : ${sortie}`);
