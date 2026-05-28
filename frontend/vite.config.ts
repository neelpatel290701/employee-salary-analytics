/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

// Single Vite config powering both dev (with /api proxy to the backend) and
// test (jsdom + Vitest). See docs/03-architecture.md §3.1 for the rationale
// behind Vite-over-Next.js, and docs/06-tdd-strategy.md §4 for the test
// tooling (Vitest + React Testing Library + jsdom).

export default defineConfig({
  plugins: [react()],

  // Read .env files from the monorepo root so backend and frontend share a
  // single source of environment configuration. Vite only exposes VITE_*
  // prefixed variables to the bundle.
  envDir: fileURLToPath(new URL('..', import.meta.url)),

  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },

  server: {
    port: 5173,
    // Forward /api/* requests to the backend so the browser sees a same-origin
    // setup in development. CORS becomes a production-only concern, where the
    // backend's allow-list (ALLOWED_ORIGINS env var) handles it.
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },

  test: {
    environment: 'jsdom',
    globals: false,
    setupFiles: ['./tests/_support/setup.ts'],
    include: ['tests/**/*.{test,spec}.{ts,tsx}'],
    css: false,
  },
});
