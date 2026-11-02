// Tests d'intégration réels contre les API de l'INPI.
//
// Ils ne s'exécutent qu'en local, si un fichier .env (exclu du dépôt) fournit
// INPI_EMAIL et INPI_MOT_DE_PASSE. Lancement : npm run build && npm run test:integration
// Ils consomment le quota de votre compte : un seul serveur et une seule
// connexion sont utilisés pour l'ensemble des appels.

import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const fichierEnv = fileURLToPath(new URL('../../.env', import.meta.url));
if (existsSync(fichierEnv)) process.loadEnvFile(fichierEnv);
const actif = Boolean(process.env.INPI_EMAIL && process.env.INPI_MOT_DE_PASSE);

describe.skipIf(!actif)('API de l’INPI (réelles)', () => {
  let client: Client;

  beforeAll(async () => {
    client = new Client({ name: 'tests-integration', version: '0.0.0' });
    await client.connect(
      new StdioClientTransport({
        command: process.execPath,
        args: [fileURLToPath(new URL('../../dist/index.js', import.meta.url))],
        env: { ...(process.env as Record<string, string>), INPI_JOURNAL: 'erreur' },
      }),
    );
  });

  afterAll(async () => {
    await client?.close();
  });

  async function appeler(outil: string, args: Record<string, unknown> = {}) {
    const r = await client.callTool({ name: outil, arguments: args }, undefined, { timeout: 180_000 });
    const texte = (r.content as Array<{ type: string; text?: string }>).map((c) => c.text ?? '').join('\n');
    return { texte, erreur: Boolean(r.isError) };
  }

  it('verifier_acces renvoie l’état de chaque accès', async () => {
    const { texte } = await appeler('verifier_acces');
    expect(texte).toMatch(/Accès INPI : \d sur 4 fonctionnent/);
    expect(texte).toContain('Marques');
  });

  it('fiche_marque FR4020655 restitue le nom, les classes et l’historique', async () => {
    const { texte, erreur } = await appeler('fiche_marque', { numero: 'FR4020655' });
    expect(erreur).toBe(false);
    expect(texte).toContain('WORLDLINE');
    expect(texte).toContain('### Classe 36');
    expect(texte).toContain('Transmission totale de propriété');
    expect(texte).toContain('data.inpi.fr/marques/FR4020655');
  });

  it('rechercher_marques trouve WORLDLINE en classes 9 ou 36', async () => {
    const { texte, erreur } = await appeler('rechercher_marques', { nom: 'WORLDLINE', classes: [9, 36], taille: 5 });
    expect(erreur).toBe(false);
    expect(texte).toMatch(/\d+ marque\(s\) trouvée\(s\)/);
    expect(texte).toContain('WORLDLINE');
  });

  it('fiche_entreprise 403052111 restitue capital, dirigeants et commissaires aux comptes', async () => {
    const { texte, erreur } = await appeler('fiche_entreprise', { siren: '403052111' });
    expect(erreur).toBe(false);
    expect(texte).toContain('BOULANGERIES PAUL');
    expect(texte).toContain('Capital social');
    expect(texte).toContain('Commissaire aux comptes titulaire');
    expect(texte).not.toMatch(/bénéficiaire effectif :/i);
  });

  it('chiffres_cles_comptes 403052111 lit le chiffre d’affaires 2024', async () => {
    const { texte, erreur } = await appeler('chiffres_cles_comptes', { siren: '403052111', exercice: 2024 });
    expect(erreur).toBe(false);
    expect(texte).toContain("| Chiffre d'affaires net | 73 611 839 € | 75 869 141 € |");
    expect(texte).toContain('| Résultat net (bénéfice ou perte) | -2 197 350 € | -5 022 746 € |');
  });

  it('lister_documents_entreprise filtre les actes contenant des statuts', async () => {
    const { texte, erreur } = await appeler('lister_documents_entreprise', { siren: '403052111', statuts_seulement: true });
    expect(erreur).toBe(false);
    expect(texte).toMatch(/Actes contenant des statuts \(\d+ sur \d+ actes\)/);
  });
});
