import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';

import { app } from '../../src/app.js';
import { prisma } from '../../src/db/prisma.js';
import { buildEmployee } from '../_support/buildEmployee.js';

// Integration tests for POST /api/employees against the test database.
// Contract: docs/05-api-design.md §5.2.
//
// Per docs/06-tdd-strategy.md §5, every test truncates `employees` first
// and seeds only what it needs - no shared fixtures across tests.

beforeEach(async () => {
  await prisma.$executeRawUnsafe('TRUNCATE TABLE employees');
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('POST /api/employees', () => {
  it('creates an employee and returns 201 with a Location header', async () => {
    const body = buildEmployee();
    const res = await request(app).post('/api/employees').send(body);

    expect(res.status).toBe(201);
    expect(res.headers.location).toMatch(/^\/api\/employees\/[a-z0-9]+$/);
    expect(res.body.data).toMatchObject({
      email: body.email,
      fullName: body.fullName,
      jobTitle: body.jobTitle,
      country: body.country,
      department: body.department,
      salary: body.salary,
      employmentType: body.employmentType,
      hireDate: body.hireDate,
    });
    expect(res.body.data.id).toMatch(/^[a-z0-9]+$/);
    expect(res.body.data.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(res.body.data.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('defaults employmentType to FULL_TIME when the field is omitted', async () => {
    const { employmentType: _omit, ...withoutEmploymentType } = buildEmployee();
    const res = await request(app).post('/api/employees').send(withoutEmploymentType);

    expect(res.status).toBe(201);
    expect(res.body.data.employmentType).toBe('FULL_TIME');
  });

  it('normalises the email to lowercase before storing', async () => {
    const body = buildEmployee({ email: 'Priya.R+TEST@EXAMPLE.com' });
    const res = await request(app).post('/api/employees').send(body);

    expect(res.status).toBe(201);
    expect(res.body.data.email).toBe('priya.r+test@example.com');
  });

  it('normalises the country to uppercase before storing', async () => {
    const body = buildEmployee({ country: 'in' });
    const res = await request(app).post('/api/employees').send(body);

    expect(res.status).toBe(201);
    expect(res.body.data.country).toBe('IN');
  });

  it('trims whitespace from fullName and jobTitle', async () => {
    const body = buildEmployee({
      fullName: '  Priya  ',
      jobTitle: '  Engineer  ',
    });
    const res = await request(app).post('/api/employees').send(body);

    expect(res.status).toBe(201);
    expect(res.body.data.fullName).toBe('Priya');
    expect(res.body.data.jobTitle).toBe('Engineer');
  });

  it('returns 422 with field-level details when email is missing', async () => {
    const { email: _omit, ...withoutEmail } = buildEmployee();
    const res = await request(app).post('/api/employees').send(withoutEmail);

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
    expect(res.body.error.details).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: ['email'] }),
      ]),
    );
  });

  it('returns 422 when salary fails validation', async () => {
    const body = buildEmployee({ salary: '-100' });
    const res = await request(app).post('/api/employees').send(body);

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
    expect(res.body.error.details).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: ['salary'] }),
      ]),
    );
  });

  it('returns 422 with every failing field when multiple are invalid', async () => {
    const body = buildEmployee({ salary: '-100', country: 'ZZ' });
    const res = await request(app).post('/api/employees').send(body);

    expect(res.status).toBe(422);
    const paths = res.body.error.details.map(
      (d: { path: string[] }) => d.path[0],
    );
    expect(paths).toContain('salary');
    expect(paths).toContain('country');
  });

  it('returns 422 when an unknown field is present (strict mode)', async () => {
    const res = await request(app)
      .post('/api/employees')
      .send({ ...buildEmployee(), unexpected: 'field' });

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
  });

  it('returns 409 with the CONFLICT code on duplicate email', async () => {
    const body = buildEmployee();

    await request(app).post('/api/employees').send(body).expect(201);

    const res = await request(app).post('/api/employees').send(body);

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CONFLICT');
    expect(res.body.error.message.toLowerCase()).toContain('email');
  });

  it('treats a duplicate email case-insensitively (normalisation applies)', async () => {
    const body = buildEmployee({ email: 'priya@example.com' });
    await request(app).post('/api/employees').send(body).expect(201);

    const res = await request(app).post('/api/employees').send({
      ...body,
      email: 'PRIYA@example.com',
    });

    expect(res.status).toBe(409);
  });
});
