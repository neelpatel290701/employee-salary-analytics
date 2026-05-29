import { app } from './app.js';
import { config } from './config.js';

// The HTTP listener entry point. `app` is composed in app.ts; this file's
// only job is to bind it to a port. Splitting the listener from the app means
// tests can import `app` without a real socket - see docs/06-tdd-strategy.md
// §4.

// Top-level safety net: catch anything that escapes normal error handling and
// make sure it appears in the deployment logs before the process exits. Without
// these handlers a crash produces zero output, making it impossible to diagnose
// startup failures in production.
process.on('uncaughtException', (err) => {
  // eslint-disable-next-line no-console
  console.error('Uncaught exception — shutting down:', err);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  // eslint-disable-next-line no-console
  console.error('Unhandled promise rejection — shutting down:', reason);
  process.exit(1);
});

try {
  const server = app.listen(config.PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`API listening on :${config.PORT}`);
  });

  server.on('error', (err) => {
    // eslint-disable-next-line no-console
    console.error('Server error — shutting down:', err);
    process.exit(1);
  });
} catch (err) {
  // eslint-disable-next-line no-console
  console.error('Failed to start server:', err);
  process.exit(1);
}
