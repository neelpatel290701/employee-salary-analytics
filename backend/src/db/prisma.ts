import { PrismaClient } from '@prisma/client';
import { config } from '../config.js';

// A single PrismaClient instance shared across the process. Prisma manages its
// own connection pool; we tune the size via ?connection_limit= on DATABASE_URL,
// per docs/10-deployment.md §4.4. See docs/03-architecture.md §3.3.

export const prisma = new PrismaClient({
  log: config.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
});
