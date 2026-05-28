import { Router } from 'express';

// Health probe used by Railway's healthcheck and the integration smoke test.
// Intentionally side-effect-free - it does not touch the database. A
// database-level readiness probe can be added later under a separate path if
// we need it (docs/10-deployment.md §4.1).

export const healthRouter = Router();

healthRouter.get('/', (_req, res) => {
  res.json({ status: 'ok' });
});
