import { prisma } from '../src/db/prisma.js';
import { runSeed } from '../src/seed/runner.js';

// Entry point for the seed CLI. Parses --count and --seed from argv,
// invokes the runner, prints timing, and disconnects the Prisma client
// cleanly so the Node process exits.
//
// Usage:
//   npm --workspace @app/backend run seed -- --count=10000 --seed=42
//
// Flags:
//   --count=N     number of employees to seed (default: 10000)
//   --seed=N      RNG seed for deterministic output (default: 42)
//   --if-empty    skip seeding entirely if the employees table already
//                 has any rows; lets this command be safe to chain into
//                 Railway's Pre-Deploy step (which runs on every deploy).
//                 First deploy: table empty -> seeds. Subsequent deploys:
//                 table non-empty -> no-op.

const args = process.argv.slice(2);

const getArg = (name: string, fallback: string): string => {
  const found = args.find((a) => a.startsWith(`--${name}=`));
  return found ? (found.split('=')[1] ?? fallback) : fallback;
};

const hasFlag = (name: string): boolean =>
  args.some((a) => a === `--${name}`);

const count = parseInt(getArg('count', '10000'), 10);
const seed = parseInt(getArg('seed', '42'), 10);
const ifEmpty = hasFlag('if-empty');

const main = async (): Promise<void> => {
  if (ifEmpty) {
    const existing = await prisma.employee.count();
    if (existing > 0) {
      // eslint-disable-next-line no-console
      console.log(
        `Skipping seed: ${existing.toLocaleString()} employees already exist.`,
      );
      return;
    }
    // eslint-disable-next-line no-console
    console.log('Table is empty; proceeding to seed.');
  }

  // eslint-disable-next-line no-console
  console.log(`Seeding ${count.toLocaleString()} employees with seed=${seed}...`);
  const start = Date.now();
  await runSeed({ count, seed });
  const elapsed = ((Date.now() - start) / 1000).toFixed(2);
  // eslint-disable-next-line no-console
  console.log(`Done in ${elapsed}s`);
};

main()
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error('Seed failed:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
