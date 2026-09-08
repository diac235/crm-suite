import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['tests/**/*.test.ts'],
    setupFiles: ['tests/setup.ts'],
    hookTimeout: 60_000,
    testTimeout: 60_000,
    // Las pruebas comparten la misma base de datos: se ejecutan en serie.
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
  },
});
