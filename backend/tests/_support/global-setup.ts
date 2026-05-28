import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// One-time setup that runs once before the entire vitest suite. Applies all
// pending Prisma migrations to the test database so every test starts
// against a schema that matches schema.prisma.
//
// Using prisma migrate deploy (not migrate dev) means:
//   - No shadow database is required - deploy never creates one
//   - No interactive prompts - it is idempotent and CI-safe
//   - The same command production uses against Railway is the one we use
//     against the local test DB; no per-environment drift
//
// See docs/06-tdd-strategy.md §5.5 for the broader context.

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const BACKEND_ROOT = path.resolve(__dirname, '../..');

export default async function setup(): Promise<void> {
  const testDatabaseUrl =
    process.env.DATABASE_URL ??
    'mysql://app:app@localhost:3307/employee_analytics_test';

  execSync('npx prisma migrate deploy', {
    cwd: BACKEND_ROOT,
    env: { ...process.env, DATABASE_URL: testDatabaseUrl },
    stdio: process.env.CI ? 'inherit' : 'ignore',
  });
}
