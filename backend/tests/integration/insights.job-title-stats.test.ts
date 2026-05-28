import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';

import { app } from '../../src/app.js';
import { prisma } from '../../src/db/prisma.js';
import { seedEmployee } from '../_support/seedEmployee.js';

// Integration tests for GET /api/insights/job-title-stats.
// Contract: docs/05-api-design.md §6.3. country is required per the
// brief's F8 requirement ("avg salary for the given Job Title in a
// country") - an org-wide-by-title metric would aggregate across very
// different labour markets and mislead the persona.

beforeEach(async () => {
  await prisma.$executeRawUnsafe('TRUNCATE TABLE employees');
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('GET /api/insights/job-title-stats', () => {
  it('returns 422 when the required country parameter is missing', async () => {
    const res = await request(app).get('/api/insights/job-title-stats');

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
  });

  it('returns empty data when the country has no employees', async () => {
    const res = await request(app).get(
      '/api/insights/job-title-stats?country=US',
    );

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });

  it('returns one row per jobTitle within the country with the expected shape', async () => {
    await seedEmployee({ country: 'US', jobTitle: 'Engineer', email: 'e@x.com' });

    const res = await request(app).get(
      '/api/insights/job-title-stats?country=US',
    );

    expect(res.status).toBe(200);
    expect(res.body.data[0]).toMatchObject({
      country: 'US',
      jobTitle: 'Engineer',
      count: 1,
      averageSalary: expect.stringMatching(/^\d+\.\d{2}$/),
      medianSalary: expect.stringMatching(/^\d+\.\d{2}$/),
      p25Salary: expect.stringMatching(/^\d+\.\d{2}$/),
      p75Salary: expect.stringMatching(/^\d+\.\d{2}$/),
    });
  });

  it('computes count, average, median, p25, p75 correctly for a known fixture', async () => {
    // Five engineers in US with salaries [50K, 60K, 70K, 80K, 90K].
    // Same fixture as the country-stats hand-computed test, applied to a
    // (country, jobTitle) cohort instead of a country cohort.
    //   count=5, avg=70K, median=70K, p25=60K, p75=80K
    for (const salary of ['50000.00', '60000.00', '70000.00', '80000.00', '90000.00']) {
      await seedEmployee({ country: 'US', jobTitle: 'Engineer', salary });
    }

    const res = await request(app).get(
      '/api/insights/job-title-stats?country=US',
    );

    expect(res.body.data[0]).toMatchObject({
      country: 'US',
      jobTitle: 'Engineer',
      count: 5,
      averageSalary: '70000.00',
      medianSalary: '70000.00',
      p25Salary: '60000.00',
      p75Salary: '80000.00',
    });
  });

  it('isolates cohorts so different jobTitles in the same country are separate rows', async () => {
    await seedEmployee({ country: 'US', jobTitle: 'Engineer', salary: '100000.00', email: 'e@x.com' });
    await seedEmployee({ country: 'US', jobTitle: 'Designer', salary: '80000.00', email: 'd@x.com' });

    const res = await request(app).get(
      '/api/insights/job-title-stats?country=US',
    );

    expect(res.body.data).toHaveLength(2);
    const byTitle = Object.fromEntries(
      res.body.data.map((r: { jobTitle: string; averageSalary: string }) => [
        r.jobTitle,
        r.averageSalary,
      ]),
    );
    expect(byTitle).toEqual({ Engineer: '100000.00', Designer: '80000.00' });
  });

  it('filters to a single jobTitle when ?jobTitle is provided', async () => {
    await seedEmployee({ country: 'US', jobTitle: 'Engineer', email: 'e@x.com' });
    await seedEmployee({ country: 'US', jobTitle: 'Designer', email: 'd@x.com' });

    const res = await request(app).get(
      '/api/insights/job-title-stats?country=US&jobTitle=Engineer',
    );

    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].jobTitle).toBe('Engineer');
  });

  it('returns 422 for an unknown sortBy value', async () => {
    const res = await request(app).get(
      '/api/insights/job-title-stats?country=US&sortBy=unknownColumn',
    );

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
  });
});
