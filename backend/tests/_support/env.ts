// Test environment defaults. Loaded by vitest as a setupFile BEFORE any test
// file imports the application, so config.ts has a consistent environment to
// parse. Each variable uses `??=` so a developer can override any of them
// (e.g. to point integration tests at a different DATABASE_URL) without
// editing this file.
//
// PORT is deliberately omitted - Supertest mounts the Express app directly
// without binding to a port, so the value is irrelevant in tests. Letting
// config.ts apply its default (3000) keeps the parsing path consistent with
// production.

process.env.NODE_ENV ??= 'test';
process.env.DATABASE_URL ??=
  'mysql://app:app@localhost:3306/employee_analytics_test';
process.env.ALLOWED_ORIGINS ??= 'http://localhost:5173';
process.env.LOG_LEVEL ??= 'silent';
