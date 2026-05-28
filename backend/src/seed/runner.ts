import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { prisma } from '../db/prisma.js';
import {
  createSeededRng,
  generateOne,
  type GeneratedEmployee,
} from './generator.js';

// The seed runner. Co-locates the impure side of the seed (file I/O,
// MySQL writes, timing) so generator.ts can stay pure and unit-testable.
//
// The implementation is step 2 of the optimisation ladder in
// docs/07-performance-plan.md §2.2 - createMany batches of 1000 wrapped
// in a single transaction. The full ladder:
//
//   0. Naive (prisma.create per row): ~30s at 10K - blocked by per-row
//      MySQL round-trips, one INSERT per row.
//   1. createMany without transaction: ~3s - one batched INSERT per
//      chunk of 1000, ~10 round-trips total.
//   2. (this) createMany inside one $transaction: removes per-chunk
//      autocommit overhead; comfortably under the 2s target from §1.
//   3. Raw multi-row INSERT via $executeRawUnsafe: would shave a bit
//      more but requires manual CUID generation (no @default(cuid())
//      on raw paths) and bypasses Prisma's type safety. Not worth the
//      complexity now we are inside the target.
//
// The choice to stop at step 2 is documented in docs/07 §2.2's
// "stop at step 3 if we hit the target" rule.

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Co-located with the Prisma schema by convention; the names files are
// fixture data, not application code, so they sit alongside schema.prisma
// rather than under src/.
const NAMES_DIR = path.resolve(__dirname, '../../prisma');

const BATCH_SIZE = 1000;

export type RunSeedOptions = {
  count: number;
  seed: number;
  /** Defaults to true. Set false to preserve existing rows (rare). */
  truncate?: boolean;
};

export const runSeed = async (options: RunSeedOptions): Promise<void> => {
  const { count, seed, truncate = true } = options;

  // Read both name files in parallel. At ~110 + ~130 lines this is
  // negligible work, but Promise.all is the right shape because the two
  // reads are independent.
  const [firstNames, lastNames] = await Promise.all([
    readNameFile(path.join(NAMES_DIR, 'first_names.txt')),
    readNameFile(path.join(NAMES_DIR, 'last_names.txt')),
  ]);

  if (truncate) {
    await prisma.$executeRawUnsafe('TRUNCATE TABLE employees');
  }

  const rng = createSeededRng(seed);
  const rows: GeneratedEmployee[] = [];
  for (let i = 0; i < count; i++) {
    rows.push(generateOne(firstNames, lastNames, rng, i));
  }

  await prisma.$transaction(
    chunks(rows, BATCH_SIZE).map((chunk) =>
      prisma.employee.createMany({
        data: chunk.map((row) => ({
          ...row,
          hireDate: new Date(`${row.hireDate}T00:00:00Z`),
        })),
      }),
    ),
  );
};

const readNameFile = async (filePath: string): Promise<string[]> => {
  const content = await readFile(filePath, 'utf8');
  return content
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
};

const chunks = <T>(arr: T[], size: number): T[][] => {
  const result: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    result.push(arr.slice(i, i + size));
  }
  return result;
};
