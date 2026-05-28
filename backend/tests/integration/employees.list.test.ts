import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';

import { app } from '../../src/app.js';
import { prisma } from '../../src/db/prisma.js';
import { seedEmployee } from '../_support/seedEmployee.js';

// Integration tests for GET /api/employees against the test database.
// Contract: docs/05-api-design.md §5.1.
//
// This is the largest endpoint in the API surface - pagination, filters,
// search, sort. Tests are grouped by concern (pagination, filters, search,
// sort, errors) inside the outer describe so a reviewer can scan to the
// behaviour they care about.

beforeEach(async () => {
  await prisma.$executeRawUnsafe('TRUNCATE TABLE employees');
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('GET /api/employees', () => {
  describe('when no employees exist', () => {
    it('returns 200 with empty data and zero pagination total', async () => {
      const res = await request(app).get('/api/employees');

      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([]);
      expect(res.body.pagination).toEqual({
        page: 1,
        pageSize: 50,
        total: 0,
        totalPages: 0,
      });
    });
  });

  describe('pagination', () => {
    it('returns the first page with default pageSize=50 when no params provided', async () => {
      for (let i = 0; i < 3; i++) await seedEmployee();

      const res = await request(app).get('/api/employees');

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(3);
      expect(res.body.pagination).toEqual({
        page: 1,
        pageSize: 50,
        total: 3,
        totalPages: 1,
      });
    });

    it('calculates totalPages correctly when total is not a multiple of pageSize', async () => {
      for (let i = 0; i < 7; i++) await seedEmployee();

      const res = await request(app).get('/api/employees?pageSize=3');

      // 7 rows ÷ 3 per page = 2.33 → 3 pages (ceil)
      expect(res.body.pagination.total).toBe(7);
      expect(res.body.pagination.totalPages).toBe(3);
      expect(res.body.data).toHaveLength(3);
    });

    it('returns the right slice for ?page=2&pageSize=2', async () => {
      // Seed three employees with deterministic, distinguishable emails so
      // we can verify which slice came back.
      await seedEmployee({ email: 'one@example.com' });
      await seedEmployee({ email: 'two@example.com' });
      await seedEmployee({ email: 'three@example.com' });

      const res = await request(app).get('/api/employees?page=2&pageSize=2');

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.pagination.page).toBe(2);
      expect(res.body.pagination.pageSize).toBe(2);
      expect(res.body.pagination.totalPages).toBe(2);
    });

    it('returns 422 when page is not a positive integer', async () => {
      const res = await request(app).get('/api/employees?page=0');
      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('VALIDATION_FAILED');
    });

    it('returns 422 when pageSize exceeds the 200 cap', async () => {
      const res = await request(app).get('/api/employees?pageSize=201');
      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('VALIDATION_FAILED');
    });
  });

  describe('filters', () => {
    it('filters by country', async () => {
      await seedEmployee({ country: 'US', email: 'one@example.com' });
      await seedEmployee({ country: 'IN', email: 'two@example.com' });
      await seedEmployee({ country: 'US', email: 'three@example.com' });

      const res = await request(app).get('/api/employees?country=US');

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(2);
      expect(res.body.pagination.total).toBe(2);
      expect(res.body.data.every((e: { country: string }) => e.country === 'US')).toBe(true);
    });

    it('filters by department', async () => {
      await seedEmployee({ department: 'ENGINEERING', email: 'e@example.com' });
      await seedEmployee({ department: 'SALES', email: 's@example.com' });

      const res = await request(app).get('/api/employees?department=ENGINEERING');

      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].department).toBe('ENGINEERING');
    });

    it('filters by minSalary and maxSalary inclusive', async () => {
      await seedEmployee({ salary: '50000.00', email: 'a@example.com' });
      await seedEmployee({ salary: '100000.00', email: 'b@example.com' });
      await seedEmployee({ salary: '150000.00', email: 'c@example.com' });
      await seedEmployee({ salary: '200000.00', email: 'd@example.com' });

      const res = await request(app).get(
        '/api/employees?minSalary=100000&maxSalary=150000',
      );

      expect(res.body.data).toHaveLength(2);
      const salaries = res.body.data.map((e: { salary: string }) => e.salary);
      expect(salaries.sort()).toEqual(['100000.00', '150000.00']);
    });

    it('composes multiple filters with AND', async () => {
      await seedEmployee({ country: 'US', department: 'ENGINEERING', email: '1@x.com' });
      await seedEmployee({ country: 'US', department: 'SALES', email: '2@x.com' });
      await seedEmployee({ country: 'IN', department: 'ENGINEERING', email: '3@x.com' });

      const res = await request(app).get(
        '/api/employees?country=US&department=ENGINEERING',
      );

      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].email).toBe('1@x.com');
    });

    it('returns 422 for an unknown filter parameter', async () => {
      const res = await request(app).get('/api/employees?unknownFilter=value');
      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('VALIDATION_FAILED');
    });

    it('returns 422 for an invalid department enum value', async () => {
      const res = await request(app).get('/api/employees?department=UNKNOWN');
      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('VALIDATION_FAILED');
    });

    it('returns 422 when minSalary is greater than maxSalary', async () => {
      const res = await request(app).get(
        '/api/employees?minSalary=200000&maxSalary=100000',
      );
      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('VALIDATION_FAILED');
    });
  });

  describe('search', () => {
    it('matches fullName case-insensitively', async () => {
      await seedEmployee({ fullName: 'Priya Ramaswamy', email: 'p@x.com' });
      await seedEmployee({ fullName: 'Aarav Kumar', email: 'a@x.com' });

      const res = await request(app).get('/api/employees?search=PRIYA');

      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].fullName).toBe('Priya Ramaswamy');
    });

    it('matches email partial', async () => {
      await seedEmployee({ email: 'priya@example.com' });
      await seedEmployee({ email: 'aarav@elsewhere.com' });

      const res = await request(app).get('/api/employees?search=example');

      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].email).toBe('priya@example.com');
    });
  });

  describe('sort', () => {
    it('defaults to sortBy=createdAt sortOrder=desc (newest first)', async () => {
      const first = await seedEmployee({ email: 'first@example.com' });
      // Small spacing to ensure distinct createdAt timestamps - DATETIME(3)
      // is millisecond precision, but quick inserts within a single ms can
      // tie. A 10ms gap is well beyond that.
      await new Promise((r) => setTimeout(r, 10));
      const second = await seedEmployee({ email: 'second@example.com' });

      const res = await request(app).get('/api/employees');

      expect(res.body.data[0].id).toBe(second.id);
      expect(res.body.data[1].id).toBe(first.id);
    });

    it('sorts by salary ascending when sortBy=salary&sortOrder=asc', async () => {
      await seedEmployee({ salary: '150000.00', email: 'high@x.com' });
      await seedEmployee({ salary: '50000.00', email: 'low@x.com' });
      await seedEmployee({ salary: '100000.00', email: 'mid@x.com' });

      const res = await request(app).get(
        '/api/employees?sortBy=salary&sortOrder=asc',
      );

      expect(res.body.data.map((e: { salary: string }) => e.salary)).toEqual([
        '50000.00',
        '100000.00',
        '150000.00',
      ]);
    });

    it('returns 422 for an unknown sortBy value', async () => {
      const res = await request(app).get('/api/employees?sortBy=unknownColumn');
      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('VALIDATION_FAILED');
    });
  });

  describe('response shape', () => {
    it('returns each employee in the contracted shape', async () => {
      await seedEmployee({ email: 'priya@example.com' });

      const res = await request(app).get('/api/employees');

      expect(res.body.data[0]).toMatchObject({
        id: expect.any(String),
        email: 'priya@example.com',
        fullName: expect.any(String),
        jobTitle: expect.any(String),
        country: expect.any(String),
        department: expect.any(String),
        salary: expect.stringMatching(/^\d+\.\d{2}$/),
        employmentType: expect.any(String),
        hireDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
        createdAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
        updatedAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
      });
    });
  });
});
