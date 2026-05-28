import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';

import { app } from '../../src/app.js';
import { prisma } from '../../src/db/prisma.js';
import { seedEmployee } from '../_support/seedEmployee.js';

// Integration tests for PATCH /api/employees/:id against the test database.
// Contract: docs/05-api-design.md §5.4.
//
// PATCH semantics: every field is optional, the body must be non-empty,
// every provided field is validated under the same rules as create, the
// :id segment is opaque (404 on miss), email collisions with other rows
// return 409 but updating an employee to its own existing email is allowed.

beforeEach(async () => {
  await prisma.$executeRawUnsafe('TRUNCATE TABLE employees');
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('PATCH /api/employees/:id', () => {
  describe('happy path', () => {
    it('updates a single field and returns the updated employee', async () => {
      const seeded = await seedEmployee({
        salary: '100000.00',
        fullName: 'Priya Ramaswamy',
      });

      const res = await request(app)
        .patch(`/api/employees/${seeded.id}`)
        .send({ salary: '150000.00' });

      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({
        id: seeded.id,
        salary: '150000.00',
        // Unchanged field preserved verbatim.
        fullName: 'Priya Ramaswamy',
      });
    });

    it('updates multiple fields at once', async () => {
      const seeded = await seedEmployee();

      const res = await request(app)
        .patch(`/api/employees/${seeded.id}`)
        .send({
          jobTitle: 'Staff Engineer',
          department: 'PRODUCT',
          salary: '180000.00',
        });

      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({
        jobTitle: 'Staff Engineer',
        department: 'PRODUCT',
        salary: '180000.00',
      });
    });

    it('normalises email to lowercase and country to uppercase', async () => {
      const seeded = await seedEmployee();

      const res = await request(app)
        .patch(`/api/employees/${seeded.id}`)
        .send({ email: 'NEW.EMAIL@Example.com', country: 'de' });

      expect(res.status).toBe(200);
      expect(res.body.data.email).toBe('new.email@example.com');
      expect(res.body.data.country).toBe('DE');
    });

    it('trims whitespace from string fields', async () => {
      const seeded = await seedEmployee();

      const res = await request(app)
        .patch(`/api/employees/${seeded.id}`)
        .send({ fullName: '  New Name  ', jobTitle: '  New Title  ' });

      expect(res.status).toBe(200);
      expect(res.body.data.fullName).toBe('New Name');
      expect(res.body.data.jobTitle).toBe('New Title');
    });

    it('advances updatedAt but leaves createdAt unchanged', async () => {
      const seeded = await seedEmployee();
      const beforeRead = await request(app)
        .get(`/api/employees/${seeded.id}`)
        .expect(200);

      // Small gap so the @updatedAt trigger has a different millisecond
      // than @default(now()) on createdAt - DATETIME(3) is ms precision.
      await new Promise((r) => setTimeout(r, 10));

      const res = await request(app)
        .patch(`/api/employees/${seeded.id}`)
        .send({ fullName: 'Updated Name' });

      expect(res.status).toBe(200);
      expect(res.body.data.createdAt).toBe(beforeRead.body.data.createdAt);
      expect(res.body.data.updatedAt > beforeRead.body.data.updatedAt).toBe(true);
    });

    it('preserves unmodified fields exactly', async () => {
      const seeded = await seedEmployee({
        email: 'sarah@example.com',
        country: 'US',
        department: 'SALES',
        employmentType: 'CONTRACT',
      });

      const res = await request(app)
        .patch(`/api/employees/${seeded.id}`)
        .send({ fullName: 'Sarah Different' });

      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({
        email: 'sarah@example.com',
        country: 'US',
        department: 'SALES',
        employmentType: 'CONTRACT',
        fullName: 'Sarah Different',
      });
    });

    it('allows updating an employee to its own existing email (no self-conflict)', async () => {
      const seeded = await seedEmployee({ email: 'priya@example.com' });

      // Sending the email field back unchanged must not trigger the
      // unique-constraint translation - the conflict check applies to
      // collisions with OTHER rows, not the row being updated.
      const res = await request(app)
        .patch(`/api/employees/${seeded.id}`)
        .send({ email: 'priya@example.com', fullName: 'Renamed' });

      expect(res.status).toBe(200);
      expect(res.body.data.fullName).toBe('Renamed');
      expect(res.body.data.email).toBe('priya@example.com');
    });
  });

  describe('validation', () => {
    it('returns 422 when the body is empty', async () => {
      const seeded = await seedEmployee();

      const res = await request(app)
        .patch(`/api/employees/${seeded.id}`)
        .send({});

      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('VALIDATION_FAILED');
    });

    it('returns 422 with field-level details when a field fails validation', async () => {
      const seeded = await seedEmployee();

      const res = await request(app)
        .patch(`/api/employees/${seeded.id}`)
        .send({ salary: '-100' });

      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('VALIDATION_FAILED');
      expect(res.body.error.details).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ path: ['salary'] }),
        ]),
      );
    });

    it('returns 422 when an unknown field is present (strict mode)', async () => {
      const seeded = await seedEmployee();

      const res = await request(app)
        .patch(`/api/employees/${seeded.id}`)
        .send({ unexpectedField: 'value' });

      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('VALIDATION_FAILED');
    });
  });

  describe('not found', () => {
    it('returns 404 with NOT_FOUND code and "Employee not found" message', async () => {
      // Specific message rather than just status+code, so the generic
      // notFound middleware cannot satisfy the test for the wrong reason
      // (the same anti-pattern caught in employees.read.test.ts).
      const res = await request(app)
        .patch('/api/employees/clw1234567890abcdefghijkl')
        .send({ fullName: 'Whatever' });

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
      expect(res.body.error.message).toBe('Employee not found');
    });
  });

  describe('email conflict', () => {
    it('returns 409 with CONFLICT when the new email collides with another row', async () => {
      await seedEmployee({ email: 'taken@example.com' });
      const other = await seedEmployee({ email: 'other@example.com' });

      const res = await request(app)
        .patch(`/api/employees/${other.id}`)
        .send({ email: 'taken@example.com' });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('CONFLICT');
      expect(res.body.error.message.toLowerCase()).toContain('email');
    });

    it('treats email collisions case-insensitively (normalisation applies)', async () => {
      await seedEmployee({ email: 'taken@example.com' });
      const other = await seedEmployee({ email: 'other@example.com' });

      const res = await request(app)
        .patch(`/api/employees/${other.id}`)
        .send({ email: 'TAKEN@Example.com' });

      expect(res.status).toBe(409);
    });
  });
});
