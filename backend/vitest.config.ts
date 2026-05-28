import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    setupFiles: ['tests/_support/env.ts'],
    // Integration tests share the test database (`employee_analytics_test`) and
    // truncate `employees` between tests, per docs/06-tdd-strategy.md §5. Until
    // we add tests that touch the DB, file-level parallelism is harmless. When
    // the first DB-touching integration test lands, we flip `fileParallelism`
    // to `false` (or move integration tests into their own vitest project).
    //
    // For now, with only the health smoke test, the default is fine.
  },
});
