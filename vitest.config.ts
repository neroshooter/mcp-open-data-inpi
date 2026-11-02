// Tests unitaires : aucun appel réseau, uniquement les jeux de données anonymisés.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/unitaires/**/*.test.ts'],
  },
});
