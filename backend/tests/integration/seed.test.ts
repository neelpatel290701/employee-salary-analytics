import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { prisma } from '../../src/db/prisma.js';
import { runSeed } from '../../src/seed/runner.js';

// Integration tests for the seed runner. Contract from
// docs/07-performance-plan.md §2.6 - one integration test exercises the
// runner against a fresh test database with --count=100 and asserts the
// row count. The 10K-row run is the manual benchmark, not a CI gate.
//
// These tests cover the impure part of the seed (the runner that writes
// to MySQL). The pure parts (createSeededRng, generateOne) are unit-tested
// separately in tests/unit/seed/generator.test.ts.

beforeEach(async () => {
  await prisma.$executeRawUnsafe('TRUNCATE TABLE employees');
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('runSeed()', () => {
  it('inserts the requested number of rows', async () => {
    await runSeed({ count: 100, seed: 42 });

    const count = await prisma.employee.count();
    expect(count).toBe(100);
  });

  it('produces deterministic data for the same seed across runs', async () => {
    // First run with seed=42 → take a snapshot.
    await runSeed({ count: 10, seed: 42 });
    const firstRun = await prisma.employee.findMany({
      orderBy: { email: 'asc' },
      select: { email: true, fullName: true, country: true, salary: true },
    });

    // Second run with the same seed → must reproduce the same records.
    // runSeed truncates by default so this wipes the first run's rows.
    await runSeed({ count: 10, seed: 42 });
    const secondRun = await prisma.employee.findMany({
      orderBy: { email: 'asc' },
      select: { email: true, fullName: true, country: true, salary: true },
    });

    // Decimal columns from Prisma do not structural-compare with toEqual
    // reliably, so we stringify before comparing.
    const normalise = (rows: typeof firstRun) =>
      rows.map((r) => ({ ...r, salary: r.salary.toString() }));

    expect(normalise(firstRun)).toEqual(normalise(secondRun));
  });
});
