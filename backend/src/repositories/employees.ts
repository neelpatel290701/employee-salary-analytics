import { Prisma, type Employee as EmployeeRow } from '@prisma/client';
import type { CreateEmployeeInput } from '@app/shared';

import { prisma } from '../db/prisma.js';

// Repository for the Employee aggregate. All `prisma.employee.*` calls live
// here; the service layer above does not touch Prisma directly.
//
// Domain errors are exported as named classes so callers can recognise them
// with `instanceof` without inspecting magic strings or status codes.

export type { EmployeeRow };

export class EmployeeEmailConflictError extends Error {
  constructor(public readonly email: string) {
    super(`An employee with email ${email} already exists`);
    this.name = 'EmployeeEmailConflictError';
  }
}

// Look up a single employee by id. Returns null when the id does not
// resolve to a row - callers translate that into a 404 at their layer.
// findUnique is parameterised, so the id can be any opaque string from
// the URL without SQL-injection risk; an unparsable or impossibly-long
// value still just returns null.
export const findEmployeeById = async (
  id: string,
): Promise<EmployeeRow | null> => {
  return prisma.employee.findUnique({ where: { id } });
};

// Insert a new employee row. The input arrives already validated and
// normalised by createEmployeeInputSchema in the route layer, so this
// function does not re-validate. hireDate is converted from a YYYY-MM-DD
// string into a Date anchored at UTC midnight - matching the @db.Date
// column type which discards the time component.
export const insertEmployee = async (
  input: CreateEmployeeInput,
): Promise<EmployeeRow> => {
  try {
    return await prisma.employee.create({
      data: {
        ...input,
        hireDate: new Date(`${input.hireDate}T00:00:00Z`),
      },
    });
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === 'P2002'
    ) {
      // P2002 is "unique constraint failed". The only unique column on
      // employees is email (see docs/04-data-model.md §3), so we can map
      // every P2002 directly to the email-conflict domain error without
      // inspecting meta.target.
      throw new EmployeeEmailConflictError(input.email);
    }
    throw err;
  }
};
