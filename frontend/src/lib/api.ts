// Typed fetch wrapper. Per-endpoint client functions arrive during the TDD
// feature loops, each consuming a zod schema from @app/shared so the request
// and response shapes cannot drift between server and client.
//
// VITE_API_URL is read at build time (docs/03-architecture.md §3.1). In dev
// the Vite proxy forwards /api -> backend so this value is effectively unused;
// in production it is the Railway backend URL.

const API_BASE = import.meta.env.VITE_API_URL ?? '';

// Mirrors the backend's structured error envelope (docs/05-api-design.md §3).
// Every failed request throws this so consumer code can switch on `code`
// instead of inspecting status numbers.
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

type RequestOptions = {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  signal?: AbortSignal;
};

export const apiRequest = async <T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> => {
  const response = await fetch(`${API_BASE}${path}`, {
    method: options.method ?? 'GET',
    headers: { 'Content-Type': 'application/json' },
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    signal: options.signal,
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as
      | { error?: { code?: string; message?: string; details?: unknown } }
      | null;
    throw new ApiError(
      response.status,
      payload?.error?.code ?? 'UNKNOWN',
      payload?.error?.message ?? `Request failed: ${response.status}`,
      payload?.error?.details,
    );
  }

  // 204 No Content - DELETE responses do not carry a body.
  if (response.status === 204) return undefined as T;

  return (await response.json()) as T;
};
