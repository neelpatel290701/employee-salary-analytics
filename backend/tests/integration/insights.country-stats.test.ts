import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';

import { app } from '../../src/app.js';
import { prisma } from '../../src/db/prisma.js';
import { seedEmployee } from '../_support/seedEmployee.js';

// Integration tests for GET /api/insights/country-stats against the test
// database. Contract: docs/05-api-design.md §6.2.
//
// This is the central insights endpoint - the one Q3 in
// docs/02-product-thinking.md ("what does compensation look like in
// <country>?") and the brief's F7 requirement both point at. The
// distributional metrics it returns (min, max, avg, median, P25, P75)
// are computed in application code via the percentile/summarize
// primitives unit-tested in tests/unit/lib/stats.test.ts.

beforeEach(async () => {
  await prisma.$executeRawUnsafe('TRUNCATE TABLE employees');
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('GET /api/insights/country-stats', () => {
  it('returns an empty data array when there are no employees', async () => {
    const res = await request(app).get('/api/insights/country-stats');

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });

  describe('aggregation', () => {
    it('returns one CountryStats row per country with employees', async () => {
      await seedEmployee({ country: 'US', salary: '100000.00', email: 'u1@x.com' });
      await seedEmployee({ country: 'US', salary: '200000.00', email: 'u2@x.com' });
      await seedEmployee({ country: 'IN', salary: '50000.00', email: 'i1@x.com' });

      const res = await request(app).get('/api/insights/country-stats');

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(2);
      const countries = res.body.data.map((r: { country: string }) => r.country).sort();
      expect(countries).toEqual(['IN', 'US']);
    });

    it('includes count, min/max/avg/median/p25/p75 salary, and total payroll on every row', async () => {
      await seedEmployee({ country: 'US' });

      const res = await request(app).get('/api/insights/country-stats');

      expect(res.status).toBe(200);
      expect(res.body.data[0]).toMatchObject({
        country: 'US',
        count: 1,
        minSalary: expect.stringMatching(/^\d+\.\d{2}$/),
        maxSalary: expect.stringMatching(/^\d+\.\d{2}$/),
        averageSalary: expect.stringMatching(/^\d+\.\d{2}$/),
        medianSalary: expect.stringMatching(/^\d+\.\d{2}$/),
        p25Salary: expect.stringMatching(/^\d+\.\d{2}$/),
        p75Salary: expect.stringMatching(/^\d+\.\d{2}$/),
        totalPayrollUsd: expect.stringMatching(/^\d+\.\d{2}$/),
      });
    });

    it('computes count, min, max, average, median, p25, p75 correctly for a known fixture', async () => {
      // Hand-computed fixture: [50000, 60000, 70000, 80000, 90000]
      //   count = 5
      //   min   = 50000, max = 90000
      //   avg   = 70000
      //   p50   = sorted[2] = 70000
      //   p25   = sorted[1] = 60000
      //   p75   = sorted[3] = 80000
      //   total = 350000
      for (const salary of ['50000.00', '60000.00', '70000.00', '80000.00', '90000.00']) {
        await seedEmployee({ country: 'US', salary });
      }

      const res = await request(app).get('/api/insights/country-stats?country=US');

      expect(res.status).toBe(200);
      expect(res.body.data[0]).toMatchObject({
        country: 'US',
        count: 5,
        minSalary: '50000.00',
        maxSalary: '90000.00',
        averageSalary: '70000.00',
        medianSalary: '70000.00',
        p25Salary: '60000.00',
        p75Salary: '80000.00',
        totalPayrollUsd: '350000.00',
      });
    });

    it('correctly groups salaries by country (no cross-country bleed)', async () => {
      // US has high salaries, IN has low salaries. If the implementation
      // accidentally pooled across countries the medians would converge.
      await seedEmployee({ country: 'US', salary: '100000.00', email: 'u1@x.com' });
      await seedEmployee({ country: 'US', salary: '200000.00', email: 'u2@x.com' });
      await seedEmployee({ country: 'IN', salary: '10000.00', email: 'i1@x.com' });
      await seedEmployee({ country: 'IN', salary: '20000.00', email: 'i2@x.com' });

      const res = await request(app).get('/api/insights/country-stats');

      const us = res.body.data.find((r: { country: string }) => r.country === 'US');
      const ind = res.body.data.find((r: { country: string }) => r.country === 'IN');

      expect(us.averageSalary).toBe('150000.00');
      expect(ind.averageSalary).toBe('15000.00');
    });
  });

  describe('filters', () => {
    it('returns a single row when ?country=X is provided', async () => {
      await seedEmployee({ country: 'US', email: 'u@x.com' });
      await seedEmployee({ country: 'IN', email: 'i@x.com' });

      const res = await request(app).get('/api/insights/country-stats?country=US');

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].country).toBe('US');
    });

    it('returns empty data when ?country has no matching employees', async () => {
      await seedEmployee({ country: 'US' });

      const res = await request(app).get('/api/insights/country-stats?country=DE');

      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([]);
    });

    it('returns 422 for an invalid country code', async () => {
      const res = await request(app).get('/api/insights/country-stats?country=ZZ');

      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('VALIDATION_FAILED');
    });
  });

  describe('sort', () => {
    it('defaults to sortBy=count sortOrder=desc (countries with the most employees first)', async () => {
      // 3 US, 2 IN, 1 DE - default desc should put US first, DE last.
      for (let i = 0; i < 3; i++) await seedEmployee({ country: 'US', email: `u${i}@x.com` });
      for (let i = 0; i < 2; i++) await seedEmployee({ country: 'IN', email: `i${i}@x.com` });
      await seedEmployee({ country: 'DE', email: 'd@x.com' });

      const res = await request(app).get('/api/insights/country-stats');

      expect(res.body.data.map((r: { country: string }) => r.country)).toEqual([
        'US',
        'IN',
        'DE',
      ]);
    });

    it('reorders when sortBy=averageSalary&sortOrder=asc', async () => {
      await seedEmployee({ country: 'US', salary: '100000.00', email: 'u@x.com' });
      await seedEmployee({ country: 'IN', salary: '50000.00', email: 'i@x.com' });
      await seedEmployee({ country: 'DE', salary: '75000.00', email: 'd@x.com' });

      const res = await request(app).get(
        '/api/insights/country-stats?sortBy=averageSalary&sortOrder=asc',
      );

      expect(res.body.data.map((r: { country: string }) => r.country)).toEqual([
        'IN',
        'DE',
        'US',
      ]);
    });

    it('returns 422 for an unknown sortBy value', async () => {
      const res = await request(app).get(
        '/api/insights/country-stats?sortBy=unknownColumn',
      );

      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('VALIDATION_FAILED');
    });
  });
});
