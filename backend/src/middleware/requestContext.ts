import { randomUUID } from 'node:crypto';
import { pinoHttp } from 'pino-http';
import { config } from '../config.js';

// Request-context middleware. Two responsibilities:
//   1. Assign each request a stable `requestId` (honour an inbound
//      `X-Request-Id` header if present so a client can correlate, otherwise
//      generate one) and echo it back in the response header.
//   2. Emit a structured log line per request with `requestId`, method, URL,
//      status, and duration. Body content is intentionally not logged.
// See docs/03-architecture.md §6.5 and docs/05-api-design.md §3.3.

export const requestContext = pinoHttp({
  level: config.LOG_LEVEL,
  genReqId: (req, res) => {
    const inbound = req.headers['x-request-id'];
    const id = typeof inbound === 'string' && inbound.length > 0 ? inbound : randomUUID();
    res.setHeader('x-request-id', id);
    return id;
  },
  customLogLevel: (_req, res, err) => {
    if (err || res.statusCode >= 500) return 'error';
    if (res.statusCode >= 400) return 'warn';
    return 'info';
  },
  serializers: {
    req: (req) => ({ id: req.id, method: req.method, url: req.url }),
    res: (res) => ({ statusCode: res.statusCode }),
  },
});
