import { defineConfig } from 'vitest/config';

// Single Vitest config for the backend. Integration tests in
// tests/integration/* share the test database (employee_analytics_test) and
// TRUNCATE between tests, so we run everything single-fork. Unit tests (none
// yet, but coming as services and helpers land) are pure functions; running
// them under the same single-fork pool costs nothing measurable at our
// suite size.
//
// See docs/06-tdd-strategy.md §5 for the data-isolation rationale.

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    setupFiles: ['tests/_support/env.ts'],
    globalSetup: ['tests/_support/global-setup.ts'],
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
  },
});
