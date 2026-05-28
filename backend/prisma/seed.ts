import { prisma } from '../src/db/prisma.js';
import { runSeed } from '../src/seed/runner.js';

// Entry point for the seed CLI. Parses --count and --seed from argv,
// invokes the runner, prints timing, and disconnects the Prisma client
// cleanly so the Node process exits.
//
// Usage:
//   npm --workspace @app/backend run seed -- --count=10000 --seed=42
//
// Both flags have sensible defaults (count=10000 matching the brief's
// "10,000 employees", seed=42 for reproducibility across runs).

const args = process.argv.slice(2);

const getArg = (name: string, fallback: string): string => {
  const found = args.find((a) => a.startsWith(`--${name}=`));
  return found ? (found.split('=')[1] ?? fallback) : fallback;
};

const count = parseInt(getArg('count', '10000'), 10);
const seed = parseInt(getArg('seed', '42'), 10);

const main = async (): Promise<void> => {
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
