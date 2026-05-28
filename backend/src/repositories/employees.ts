import { Prisma, type Employee as EmployeeRow } from '@prisma/client';
import type {
  CreateEmployeeInput,
  ListEmployeesQuery,
  UpdateEmployeeInput,
} from '@app/shared';

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

export class EmployeeNotFoundError extends Error {
  constructor(public readonly id: string) {
    super(`No employee found with id ${id}`);
    this.name = 'EmployeeNotFoundError';
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

// Translate a validated list query into a Prisma WHERE clause. The query
// arrives already validated by listEmployeesQuerySchema, so this function
// is total - every branch is reachable, no defensive null checks.
//
// One MySQL-specific note: Prisma's `mode: 'insensitive'` flag for string
// filters is Postgres/MongoDB-only. We rely on MySQL's case-insensitive
// collation (utf8mb4_unicode_ci on every text column) to provide the
// case-insensitive match contracted in docs/05-api-design.md §2.6, so the
// plain `contains` and equality filters below are case-insensitive by
// virtue of the column collation alone.
const buildWhere = (query: ListEmployeesQuery): Prisma.EmployeeWhereInput => {
  const where: Prisma.EmployeeWhereInput = {};

  if (query.country) where.country = query.country;
  if (query.jobTitle) where.jobTitle = query.jobTitle;
  if (query.department) where.department = query.department;
  if (query.employmentType) where.employmentType = query.employmentType;

  if (query.minSalary !== undefined || query.maxSalary !== undefined) {
    const salaryFilter: Prisma.DecimalFilter = {};
    if (query.minSalary !== undefined) salaryFilter.gte = query.minSalary;
    if (query.maxSalary !== undefined) salaryFilter.lte = query.maxSalary;
    where.salary = salaryFilter;
  }

  if (query.search) {
    where.OR = [
      { fullName: { contains: query.search } },
      { email: { contains: query.search } },
    ];
  }

  return where;
};

// Build the ORDER BY clause from the validated query. The id tiebreaker
// makes the sort stable - two rows that tie on the primary sort key keep
// a deterministic order, which keeps pagination deterministic too
// (docs/05-api-design.md §2.7).
const buildOrderBy = (
  query: ListEmployeesQuery,
): Prisma.EmployeeOrderByWithRelationInput[] => [
  { [query.sortBy]: query.sortOrder },
  { id: query.sortOrder },
];

// List employees matching the query, plus the total count of matching rows
// (regardless of pagination). Both queries share the same WHERE clause and
// are issued in parallel.
export const findManyEmployees = async (
  query: ListEmployeesQuery,
): Promise<{ rows: EmployeeRow[]; total: number }> => {
  const where = buildWhere(query);
  const orderBy = buildOrderBy(query);
  const skip = (query.page - 1) * query.pageSize;
  const take = query.pageSize;

  const [rows, total] = await Promise.all([
    prisma.employee.findMany({ where, orderBy, skip, take }),
    prisma.employee.count({ where }),
  ]);

  return { rows, total };
};

// Delete an employee by id. Hard delete per assumption A5 - the row is
// gone after this returns, with no soft-deleted record left behind. P2025
// means the row did not exist to begin with, which the service translates
// into a 404.
export const deleteEmployee = async (id: string): Promise<void> => {
  try {
    await prisma.employee.delete({ where: { id } });
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === 'P2025'
    ) {
      throw new EmployeeNotFoundError(id);
    }
    throw err;
  }
};

// Update an existing employee. The input arrives already validated and
// normalised by updateEmployeeInputSchema in the route layer, with every
// field optional and at least one present (the schema's refine guarantees
// non-empty bodies). Self-conflict avoidance comes for free: when the
// email field is sent back unchanged, Prisma's update does not fire P2002
// because the row's existing value satisfies the unique constraint.
export const updateEmployee = async (
  id: string,
  input: UpdateEmployeeInput,
): Promise<EmployeeRow> => {
  const data: Prisma.EmployeeUpdateInput = { ...input };
  if (input.hireDate !== undefined) {
    data.hireDate = new Date(`${input.hireDate}T00:00:00Z`);
  }

  try {
    return await prisma.employee.update({ where: { id }, data });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      if (err.code === 'P2025') {
        // P2025: "An operation failed because it depends on one or more
        // records that were required but not found." The :id segment did
        // not resolve to a row.
        throw new EmployeeNotFoundError(id);
      }
      if (err.code === 'P2002') {
        // P2002: unique constraint violation. Only email is unique on
        // employees (docs/04-data-model.md §3), so we can map directly.
        throw new EmployeeEmailConflictError(input.email ?? '');
      }
    }
    throw err;
  }
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
