import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';

import { app } from '../../src/app.js';
import { prisma } from '../../src/db/prisma.js';
import { seedEmployee } from '../_support/seedEmployee.js';

// Integration tests for DELETE /api/employees/:id against the test database.
// Contract: docs/05-api-design.md §5.5.
//
// Hard delete per assumption A5 (docs/01-requirements-analysis.md). 204 on
// success with no response body. 404 on miss with the same NOT_FOUND
// envelope every other endpoint uses for not-found.

beforeEach(async () => {
  await prisma.$executeRawUnsafe('TRUNCATE TABLE employees');
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('DELETE /api/employees/:id', () => {
  it('returns 204 with an empty body on successful deletion', async () => {
    const seeded = await seedEmployee();

    const res = await request(app).delete(`/api/employees/${seeded.id}`);

    expect(res.status).toBe(204);
    // 204 must have no body - that is the HTTP semantic of "No Content".
    // Supertest serialises an empty body as an empty string, not null.
    expect(res.body).toEqual({});
    expect(res.text).toBe('');
  });

  it('makes the deleted employee unfetchable via GET', async () => {
    const seeded = await seedEmployee();

    await request(app).delete(`/api/employees/${seeded.id}`).expect(204);

    const res = await request(app).get(`/api/employees/${seeded.id}`);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('returns 404 with NOT_FOUND and "Employee not found" when id does not exist', async () => {
    // Specific message rather than just status+code so the generic
    // notFound middleware cannot satisfy the test for the wrong reason.
    const res = await request(app).delete(
      '/api/employees/clw1234567890abcdefghijkl',
    );

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
    expect(res.body.error.message).toBe('Employee not found');
  });

  it('returns 404 for a malformed-looking id (URL treated as opaque)', async () => {
    const res = await request(app).delete('/api/employees/not-a-real-id');

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
    expect(res.body.error.message).toBe('Employee not found');
  });

  it('preserves other employees when one is deleted', async () => {
    const a = await seedEmployee({ email: 'a@example.com' });
    const b = await seedEmployee({ email: 'b@example.com' });
    const c = await seedEmployee({ email: 'c@example.com' });

    await request(app).delete(`/api/employees/${b.id}`).expect(204);

    await request(app).get(`/api/employees/${a.id}`).expect(200);
    await request(app).get(`/api/employees/${b.id}`).expect(404);
    await request(app).get(`/api/employees/${c.id}`).expect(200);
  });

  it('returns 404 when deleting the same id twice (no soft-delete)', async () => {
    const seeded = await seedEmployee();

    await request(app).delete(`/api/employees/${seeded.id}`).expect(204);

    // Second DELETE on the same id - the row is gone, so the second call
    // must produce the same 404 as deleting an id that never existed.
    // This pins down the hard-delete contract: there is no soft-deleted
    // row left behind that a second DELETE could find and "re-delete."
    const res = await request(app).delete(`/api/employees/${seeded.id}`);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});
