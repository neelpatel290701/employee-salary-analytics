import { app } from './app.js';
import { config } from './config.js';

// The HTTP listener entry point. `app` is composed in app.ts; this file's
// only job is to bind it to a port. Splitting the listener from the app means
// tests can import `app` without a real socket - see docs/06-tdd-strategy.md
// §4.

app.listen(config.PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`API listening on :${config.PORT}`);
});
