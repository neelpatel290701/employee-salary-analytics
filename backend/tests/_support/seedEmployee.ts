import type { z } from 'zod';
import {
  createEmployeeInputSchema,
  type CreateEmployeeInput,
} from '@app/shared';
import type { Employee as EmployeeRow } from '@prisma/client';

import { prisma } from '../../src/db/prisma.js';
import { buildEmployee } from './buildEmployee.js';

// Helper for tests that need an employee row fixture without going through
// the HTTP layer. Builds the shape via buildEmployee, validates and
// normalises via the same schema the API uses (so the seeded row matches
// what POST /api/employees would store), and writes directly via Prisma.
//
// Use this for list/filter/sort tests where the create-endpoint contract is
// already covered elsewhere - exercising HTTP for every seed adds an order
// of magnitude to the test suite without proving anything new.
//
// For tests that explicitly exercise POST /api/employees, use Supertest.

type EmployeeInputRaw = z.input<typeof createEmployeeInputSchema>;

export const seedEmployee = async (
  overrides?: Partial<EmployeeInputRaw>,
): Promise<EmployeeRow> => {
  const validated: CreateEmployeeInput = createEmployeeInputSchema.parse(
    buildEmployee(overrides),
  );

  return prisma.employee.create({
    data: {
      ...validated,
      hireDate: new Date(`${validated.hireDate}T00:00:00Z`),
    },
  });
};
