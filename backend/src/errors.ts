// HttpError is the single error shape services use to signal a non-2xx
// response with a known code. The error handler in middleware/errorHandler.ts
// is the one place that translates it into the JSON envelope contracted in
// docs/05-api-design.md §3.
//
// Routes never construct HttpError themselves - they call services and
// propagate errors via `next(err)`. Services throw HttpError when a domain
// outcome maps onto a specific HTTP status (409 for a conflict, 404 for a
// missing record, etc.).
//
// HttpError lives at the top of src/ rather than inside middleware/ so the
// service layer can throw it without depending on a middleware module,
// keeping the layered architecture in docs/03-architecture.md §3.2 honest.

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
