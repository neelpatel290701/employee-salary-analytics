import { defineConfig } from 'vitest/config';

// Minimal vitest config for the @app/shared workspace. Tests in this package
// are pure (no DB, no HTTP, no DOM) - they validate the zod schemas and
// helpers that backend and frontend share.

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
