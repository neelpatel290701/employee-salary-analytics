import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';

import { app } from '../../src/app.js';
import { prisma } from '../../src/db/prisma.js';
import { buildEmployee } from '../_support/buildEmployee.js';

// Integration tests for GET /api/employees/:id against the test database.
// Contract: docs/05-api-design.md §5.3.
//
// Per docs/06-tdd-strategy.md §5, every test truncates `employees` first
// and seeds only what it needs - no shared fixtures across tests.

beforeEach(async () => {
  await prisma.$executeRawUnsafe('TRUNCATE TABLE employees');
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('GET /api/employees/:id', () => {
  it('returns 200 with the employee when the id exists', async () => {
    const created = await request(app)
      .post('/api/employees')
      .send(buildEmployee())
      .expect(201);

    const res = await request(app).get(`/api/employees/${created.body.data.id}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      id: created.body.data.id,
      email: created.body.data.email,
      fullName: created.body.data.fullName,
      jobTitle: created.body.data.jobTitle,
      country: created.body.data.country,
      department: created.body.data.department,
      salary: created.body.data.salary,
      employmentType: created.body.data.employmentType,
      hireDate: created.body.data.hireDate,
    });
  });

  it('returns the same serialised shape as the POST response (round-trip)', async () => {
    const created = await request(app)
      .post('/api/employees')
      .send(buildEmployee())
      .expect(201);

    const fetched = await request(app)
      .get(`/api/employees/${created.body.data.id}`)
      .expect(200);

    // Exact equality matters here: the read serialiser must produce the
    // same shape (and the same DECIMAL-as-string formatting, the same
    // YYYY-MM-DD hireDate, the same ISO timestamps) as the create
    // serialiser, otherwise the client would see different values for
    // the same row depending on which endpoint it called.
    expect(fetched.body.data).toEqual(created.body.data);
  });

  it('returns 404 with the NOT_FOUND code when no employee has the given id', async () => {
    // A well-formed-looking CUID that does not exist in the database.
    const res = await request(app).get(
      '/api/employees/clw1234567890abcdefghijkl',
    );

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
    // Assert on the specific message - "Employee not found" - so this
    // test cannot be satisfied by the generic notFound middleware (which
    // returns "Resource not found"). Per docs/05-api-design.md §3.2 the
    // 404 example explicitly uses "Employee not found".
    expect(res.body.error.message).toBe('Employee not found');
  });

  it('returns 404 for a malformed id rather than a 400 or 422', async () => {
    // Per the API design doc, the id segment is treated as an opaque key:
    // anything that does not resolve to a row is a 404, never a 400 or
    // 422. This prevents leaking the id format and keeps clients from
    // having to know whether they got an "invalid id" or a "missing
    // record" - both are the same outcome from the API's point of view.
    const res = await request(app).get('/api/employees/not-a-real-id-shape');

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
    expect(res.body.error.message).toBe('Employee not found');
  });

  it('returns the same record across multiple reads (idempotent)', async () => {
    const created = await request(app)
      .post('/api/employees')
      .send(buildEmployee())
      .expect(201);

    const id = created.body.data.id;

    const first = await request(app).get(`/api/employees/${id}`).expect(200);
    const second = await request(app).get(`/api/employees/${id}`).expect(200);

    expect(first.body.data).toEqual(second.body.data);
  });
});
