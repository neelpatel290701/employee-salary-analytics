import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';

import { app } from '../../src/app.js';
import { prisma } from '../../src/db/prisma.js';
import { seedEmployee } from '../_support/seedEmployee.js';

// Integration tests for GET /api/insights/summary.
// Contract: docs/05-api-design.md §6.1. Org-wide top-line snapshot the
// persona sees first when landing on the Insights view.

beforeEach(async () => {
  await prisma.$executeRawUnsafe('TRUNCATE TABLE employees');
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('GET /api/insights/summary', () => {
  it('returns zero/empty values when no employees exist', async () => {
    const res = await request(app).get('/api/insights/summary');

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      totalHeadcount: 0,
      totalAnnualPayrollUsd: '0.00',
      countryCount: 0,
      jobTitleCount: 0,
      departmentBreakdown: [],
    });
  });

  it('computes totalHeadcount, totalPayroll, countryCount, jobTitleCount correctly', async () => {
    await seedEmployee({ country: 'US', jobTitle: 'Engineer', salary: '100000.00', email: '1@x.com' });
    await seedEmployee({ country: 'US', jobTitle: 'Designer', salary: '80000.00', email: '2@x.com' });
    await seedEmployee({ country: 'IN', jobTitle: 'Engineer', salary: '50000.00', email: '3@x.com' });

    const res = await request(app).get('/api/insights/summary');

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      totalHeadcount: 3,
      totalAnnualPayrollUsd: '230000.00',
      countryCount: 2, // US, IN
      jobTitleCount: 2, // Engineer, Designer
    });
  });

  it('includes a departmentBreakdown with counts per department', async () => {
    await seedEmployee({ department: 'ENGINEERING', email: '1@x.com' });
    await seedEmployee({ department: 'ENGINEERING', email: '2@x.com' });
    await seedEmployee({ department: 'SALES', email: '3@x.com' });

    const res = await request(app).get('/api/insights/summary');

    const byDept = Object.fromEntries(
      res.body.data.departmentBreakdown.map(
        (r: { department: string; count: number }) => [r.department, r.count],
      ),
    );

    expect(byDept).toMatchObject({ ENGINEERING: 2, SALES: 1 });
  });

  it('includes averageTenureYears computed from hireDate', async () => {
    // Hand-computed: hireDate '2020-01-01' is ~6 years ago in 2026.
    // Two employees with the same hire date averages to the same number.
    await seedEmployee({ hireDate: '2020-01-01', email: '1@x.com' });
    await seedEmployee({ hireDate: '2020-01-01', email: '2@x.com' });

    const res = await request(app).get('/api/insights/summary');

    // The exact value depends on today, but it must be a non-negative
    // number and reasonably close to 6 years (or 5 if not yet past
    // Jan 1 this year). We assert the shape and a generous bound.
    expect(typeof res.body.data.averageTenureYears).toBe('number');
    expect(res.body.data.averageTenureYears).toBeGreaterThan(0);
    expect(res.body.data.averageTenureYears).toBeLessThan(20);
  });
});
