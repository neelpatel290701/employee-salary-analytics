import { PrismaClient, type Prisma } from '@prisma/client';
import { config } from '../config.js';

// A single PrismaClient instance shared across the process. Prisma manages its
// own connection pool; we tune the size via ?connection_limit= on DATABASE_URL,
// per docs/10-deployment.md §4.4. See docs/03-architecture.md §3.3.
//
// Log level by environment:
//   - development: warn + error (visible signal while iterating)
//   - production:  error only (anything noisier is for the request log)
//   - test:        silent. Integration tests deliberately trigger query
//                  errors (duplicate-email, validation) to verify error
//                  handling; Prisma's default "log the failure before the
//                  caller catches it" behaviour would emit stderr lines
//                  for every such case, which is noise, not signal.

const logLevels = (): Prisma.LogLevel[] => {
  if (config.NODE_ENV === 'development') return ['warn', 'error'];
  if (config.NODE_ENV === 'test') return [];
  return ['error'];
};

export const prisma = new PrismaClient({
  log: logLevels(),
});
