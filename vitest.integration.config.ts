// Tests d'intégration réels contre les API de l'INPI.
// Ils lisent les identifiants dans le fichier .env local, exclu du dépôt,
// et ne s'exécutent jamais dans l'intégration continue.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/integration/**/*.test.ts'],
    testTimeout: 120_000,
    hookTimeout: 120_000,
    fileParallelism: false,
  },
});
