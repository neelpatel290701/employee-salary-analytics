import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';

import { app } from '../../src/app.js';
import { prisma } from '../../src/db/prisma.js';
import { seedEmployee } from '../_support/seedEmployee.js';

// Integration tests for GET /api/insights/outliers.
// Contract: docs/05-api-design.md §6.5. The interesting edge case is the
// cohort-size threshold: cohorts with n < 5 are excluded from outlier
// analysis because stddev is too noisy at low n (also documented in
// docs/02-product-thinking.md design principle 7 + tradeoff 5.8).

beforeEach(async () => {
  await prisma.$executeRawUnsafe('TRUNCATE TABLE employees');
});

afterAll(async () => {
  await prisma.$disconnect();
});

// Helper: seed N "normal" salaries plus a deliberate outlier in a single
// (country, jobTitle) cohort.
const seedCohort = async (
  country: string,
  jobTitle: string,
  normalSalaries: string[],
  outlierSalary?: string,
) => {
  let counter = 0;
  for (const salary of normalSalaries) {
    counter += 1;
    await seedEmployee({
      country,
      jobTitle,
      salary,
      email: `${country.toLowerCase()}-${jobTitle.toLowerCase()}-n${counter}@x.com`,
    });
  }
  if (outlierSalary !== undefined) {
    counter += 1;
    await seedEmployee({
      country,
      jobTitle,
      salary: outlierSalary,
      email: `${country.toLowerCase()}-${jobTitle.toLowerCase()}-outlier@x.com`,
    });
  }
};

describe('GET /api/insights/outliers', () => {
  it('returns empty data when no employees exist', async () => {
    const res = await request(app).get('/api/insights/outliers');

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });

  it('returns empty data when no employee is beyond the 2σ threshold', async () => {
    // Five employees clustered tightly around 100K - none is > 2σ away.
    await seedCohort('US', 'Engineer', [
      '95000.00',
      '98000.00',
      '100000.00',
      '102000.00',
      '105000.00',
    ]);

    const res = await request(app).get('/api/insights/outliers');

    expect(res.body.data).toEqual([]);
  });

  it('flags an employee whose salary is more than 2σ above the cohort mean', async () => {
    // Five at 100K + one at 500K. Hand check:
    //   mean = (5*100K + 500K) / 6 = 1M / 6 ~ 166667
    //   deviations: -66667 (x5), 333333 (x1)
    //   var = (5 * 66667^2 + 333333^2) / 6
    //       = (5 * 4.444e9 + 1.111e11) / 6
    //       = 1.333e11 / 6 ~ 2.222e10
    //   stddev = sqrt(2.222e10) ~ 149071
    //   outlier deviations = (500K - 166667) / 149071 ~ 2.236  -> > 2σ
    await seedCohort(
      'US',
      'Engineer',
      ['100000.00', '100000.00', '100000.00', '100000.00', '100000.00'],
      '500000.00',
    );

    const res = await request(app).get('/api/insights/outliers');

    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0]).toMatchObject({
      salary: '500000.00',
      direction: 'above',
      employee: expect.objectContaining({
        jobTitle: 'Engineer',
        country: 'US',
      }),
    });
    expect(res.body.data[0].deviationsFromMean).toBeGreaterThan(2);
  });

  it('excludes cohorts with fewer than 5 employees', async () => {
    // Only 4 employees in this cohort, but the 500K is mathematically
    // an outlier. The n<5 rule must suppress it.
    await seedCohort(
      'US',
      'Engineer',
      ['100000.00', '100000.00', '100000.00'],
      '500000.00',
    );

    const res = await request(app).get('/api/insights/outliers');

    expect(res.body.data).toEqual([]);
  });

  it('respects ?direction=above (only above-mean outliers)', async () => {
    // Cohort with one above-mean outlier and one below-mean outlier so
    // we can verify the filter actually narrows the result.
    await seedCohort(
      'US',
      'Engineer',
      [
        '100000.00',
        '100000.00',
        '100000.00',
        '100000.00',
        '100000.00',
        '500000.00',
      ],
    );
    // Add one below-mean outlier via a separate cohort of 5+ employees.
    await seedCohort(
      'US',
      'Sales',
      ['100000.00', '100000.00', '100000.00', '100000.00', '100000.00'],
      '10000.00',
    );

    const res = await request(app).get('/api/insights/outliers?direction=above');

    expect(res.body.data.every((o: { direction: string }) => o.direction === 'above')).toBe(true);
  });

  it('returns 422 for an unknown direction value', async () => {
    const res = await request(app).get(
      '/api/insights/outliers?direction=sideways',
    );

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
  });

  it('includes the employee id so the UI can link through to the record', async () => {
    // Design principle 7 in docs/02-product-thinking.md: "outliers must
    // be actionable" - the persona must be able to click through to the
    // employee record. The id field is what enables that.
    await seedCohort(
      'US',
      'Engineer',
      ['100000.00', '100000.00', '100000.00', '100000.00', '100000.00'],
      '500000.00',
    );

    const res = await request(app).get('/api/insights/outliers');

    expect(res.body.data[0].employee.id).toEqual(expect.any(String));
    expect(res.body.data[0].employee.id.length).toBeGreaterThan(0);
  });
});
