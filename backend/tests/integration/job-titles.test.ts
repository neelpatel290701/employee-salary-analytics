import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';

import { app } from '../../src/app.js';
import { prisma } from '../../src/db/prisma.js';
import { seedEmployee } from '../_support/seedEmployee.js';

// Integration tests for GET /api/job-titles.
// Contract: docs/05-api-design.md §5.6. Backs the create/edit form's
// job-title autocomplete (assumption A3 in
// docs/01-requirements-analysis.md - free-string job titles converge
// without a controlled vocabulary via UI autocomplete).

beforeEach(async () => {
  await prisma.$executeRawUnsafe('TRUNCATE TABLE employees');
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('GET /api/job-titles', () => {
  it('returns empty data when no employees exist', async () => {
    const res = await request(app).get('/api/job-titles');

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });

  it('returns distinct job titles with their frequency counts', async () => {
    await seedEmployee({ jobTitle: 'Engineer', email: '1@x.com' });
    await seedEmployee({ jobTitle: 'Engineer', email: '2@x.com' });
    await seedEmployee({ jobTitle: 'Engineer', email: '3@x.com' });
    await seedEmployee({ jobTitle: 'Designer', email: '4@x.com' });

    const res = await request(app).get('/api/job-titles');

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);

    const engineer = res.body.data.find(
      (r: { jobTitle: string }) => r.jobTitle === 'Engineer',
    );
    const designer = res.body.data.find(
      (r: { jobTitle: string }) => r.jobTitle === 'Designer',
    );

    expect(engineer.count).toBe(3);
    expect(designer.count).toBe(1);
  });

  it('orders results by count descending (most frequent first)', async () => {
    // Three Engineers, two Designers, one Manager.
    for (let i = 0; i < 3; i++) await seedEmployee({ jobTitle: 'Engineer', email: `e${i}@x.com` });
    for (let i = 0; i < 2; i++) await seedEmployee({ jobTitle: 'Designer', email: `d${i}@x.com` });
    await seedEmployee({ jobTitle: 'Manager', email: 'm@x.com' });

    const res = await request(app).get('/api/job-titles');

    expect(res.body.data.map((r: { jobTitle: string }) => r.jobTitle)).toEqual([
      'Engineer',
      'Designer',
      'Manager',
    ]);
  });

  it('filters titles by the ?search prefix', async () => {
    await seedEmployee({ jobTitle: 'Senior Engineer', email: '1@x.com' });
    await seedEmployee({ jobTitle: 'Staff Engineer', email: '2@x.com' });
    await seedEmployee({ jobTitle: 'Designer', email: '3@x.com' });

    const res = await request(app).get('/api/job-titles?search=Senior');

    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].jobTitle).toBe('Senior Engineer');
  });

  it('respects the ?limit parameter', async () => {
    for (let i = 0; i < 5; i++) {
      await seedEmployee({ jobTitle: `Title-${i}`, email: `${i}@x.com` });
    }

    const res = await request(app).get('/api/job-titles?limit=2');

    expect(res.body.data).toHaveLength(2);
  });

  it('returns 422 for a limit value above the cap', async () => {
    const res = await request(app).get('/api/job-titles?limit=51');

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
  });
});
