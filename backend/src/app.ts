import express from 'express';
import cors from 'cors';
import helmet from 'helmet';

import { config } from './config.js';
import { requestContext } from './middleware/requestContext.js';
import { errorHandler } from './middleware/errorHandler.js';
import { notFound } from './middleware/notFound.js';
import { healthRouter } from './routes/health.js';

// The Express app is exported as a value (not a side-effect of listening) so
// integration tests can mount it on a Supertest agent without binding a port.
// See docs/06-tdd-strategy.md §4 for the testing pattern.

export const createApp = () => {
  const app = express();

  // Security headers first, before anything else gets a chance to send a
  // response.
  app.use(helmet());

  app.use(
    cors({
      origin: config.ALLOWED_ORIGINS,
      credentials: false,
    }),
  );

  // 1MB cap. The largest legitimate body in this API (an Employee create
  // payload) is well under 1KB - docs/10-deployment.md §7.
  app.use(express.json({ limit: '1mb' }));

  // Request id + structured request logging.
  app.use(requestContext);

  // Routes are mounted here. The set grows as TDD pairs add feature endpoints.
  app.use('/api/health', healthRouter);

  // Tail middleware: 404 for unmatched paths, then the single error handler.
  // Order matters - errorHandler must come last.
  app.use(notFound);
  app.use(errorHandler);

  return app;
};

export const app = createApp();
