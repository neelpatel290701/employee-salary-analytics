import type { ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';

// The single source of HTTP error responses. Every error response in this API
// has the shape defined in docs/05-api-design.md §3:
//
//   { error: { code, message, details? } }
//
// Route handlers never write error responses by hand. They either throw an
// HttpError (when they know exactly what went wrong) or let a thrown
// ZodError propagate; this middleware does the translation.

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  if (err instanceof ZodError) {
    res.status(422).json({
      error: {
        code: 'VALIDATION_FAILED',
        message: 'Request validation failed',
        details: err.errors.map((e) => ({ path: e.path, message: e.message })),
      },
    });
    return;
  }

  if (err instanceof HttpError) {
    res.status(err.status).json({
      error: {
        code: err.code,
        message: err.message,
        ...(err.details !== undefined ? { details: err.details } : {}),
      },
    });
    return;
  }

  // Anything unhandled is a bug. We log it with the request context (the
  // requestId is on req.log via pino-http) but never leak the message or stack
  // to the client - docs/05-api-design.md §3.3.
  req.log?.error({ err }, 'unhandled error');
  res.status(500).json({
    error: {
      code: 'INTERNAL',
      message: 'Internal server error',
    },
  });
};
