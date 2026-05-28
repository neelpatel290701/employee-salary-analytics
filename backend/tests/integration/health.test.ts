import { describe, it, expect } from 'vitest';
import request from 'supertest';

import { app } from '../../src/app.js';

// Smoke test for GET /api/health. Two purposes:
//   1. Prove the Supertest + Express scaffolding works end-to-end before any
//      feature routes land.
//   2. Pin down the response shape that Railway's healthcheck depends on
//      (docs/10-deployment.md §4.1, §9 step 10).
//
// Every future route test in tests/integration/*.test.ts follows the same
// pattern as this one.

describe('GET /api/health', () => {
  it('returns 200 with { status: "ok" }', async () => {
    const res = await request(app).get('/api/health');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });

  it('echoes back an inbound X-Request-Id header', async () => {
    const res = await request(app)
      .get('/api/health')
      .set('x-request-id', 'test-request-123');

    expect(res.headers['x-request-id']).toBe('test-request-123');
  });

  it('generates an X-Request-Id when none is provided', async () => {
    const res = await request(app).get('/api/health');

    expect(res.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });
});
