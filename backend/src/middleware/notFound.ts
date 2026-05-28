import type { Request, Response } from 'express';

// Default 404 for any path that does not match a mounted route. Emits the same
// envelope as every other error response, per docs/05-api-design.md §3.

export const notFound = (_req: Request, res: Response): void => {
  res.status(404).json({
    error: {
      code: 'NOT_FOUND',
      message: 'Resource not found',
    },
  });
};
