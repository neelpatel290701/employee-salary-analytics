import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';

import { app } from '../../src/app.js';
import { prisma } from '../../src/db/prisma.js';
import { seedEmployee } from '../_support/seedEmployee.js';

// Integration tests for GET /api/insights/headcount.
// Contract: docs/05-api-design.md §6.4.

beforeEach(async () => {
  await prisma.$executeRawUnsafe('TRUNCATE TABLE employees');
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('GET /api/insights/headcount', () => {
  it('returns empty data when no employees exist', async () => {
    const res = await request(app).get('/api/insights/headcount');

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });

  it('defaults to groupBy=country and returns one row per country with count', async () => {
    for (let i = 0; i < 3; i++) await seedEmployee({ country: 'US', email: `u${i}@x.com` });
    for (let i = 0; i < 2; i++) await seedEmployee({ country: 'IN', email: `i${i}@x.com` });

    const res = await request(app).get('/api/insights/headcount');

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    const byCountry = Object.fromEntries(
      res.body.data.map((r: { country: string; count: number }) => [
        r.country,
        r.count,
      ]),
    );
    expect(byCountry).toEqual({ US: 3, IN: 2 });
  });

  it('returns rows with (country, department, count) when groupBy=country_department', async () => {
    await seedEmployee({ country: 'US', department: 'ENGINEERING', email: 'e1@x.com' });
    await seedEmployee({ country: 'US', department: 'ENGINEERING', email: 'e2@x.com' });
    await seedEmployee({ country: 'US', department: 'SALES', email: 's1@x.com' });

    const res = await request(app).get(
      '/api/insights/headcount?groupBy=country_department',
    );

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);

    const eng = res.body.data.find(
      (r: { department: string }) => r.department === 'ENGINEERING',
    );
    const sales = res.body.data.find(
      (r: { department: string }) => r.department === 'SALES',
    );

    expect(eng).toMatchObject({ country: 'US', department: 'ENGINEERING', count: 2 });
    expect(sales).toMatchObject({ country: 'US', department: 'SALES', count: 1 });
  });

  it('returns 422 for an invalid groupBy value', async () => {
    const res = await request(app).get('/api/insights/headcount?groupBy=invalid');

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
  });
});
