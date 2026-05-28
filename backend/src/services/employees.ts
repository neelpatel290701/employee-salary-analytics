import type { CreateEmployeeInput, Employee, ISOCountryCode } from '@app/shared';

import { HttpError } from '../errors.js';
import {
  EmployeeEmailConflictError,
  findEmployeeById,
  insertEmployee,
  type EmployeeRow,
} from '../repositories/employees.js';

// Service layer for the Employee aggregate. Business operations live here;
// the route layer above translates HTTP to service calls and back, the
// repository layer below owns Prisma access.
//
// Domain errors raised by the repository are translated into HttpError
// instances at this boundary, so the route is free of error-class
// knowledge and the central errorHandler is free of domain knowledge.

export const create = async (input: CreateEmployeeInput): Promise<Employee> => {
  try {
    const row = await insertEmployee(input);
    return serializeEmployee(row);
  } catch (err) {
    if (err instanceof EmployeeEmailConflictError) {
      throw new HttpError(
        409,
        'CONFLICT',
        'An employee with this email already exists',
      );
    }
    throw err;
  }
};

export const getById = async (id: string): Promise<Employee> => {
  const row = await findEmployeeById(id);
  if (!row) {
    throw new HttpError(404, 'NOT_FOUND', 'Employee not found');
  }
  return serializeEmployee(row);
};

// Convert a Prisma `Employee` row into the API contract shape from
// docs/05-api-design.md §5.1.
//
// Three normalisations matter:
//   - salary is `Decimal` (Prisma's Decimal.js) in the row; the API
//     returns it as a string with exactly two decimal places via
//     `.toFixed(2)`, matching the DECIMAL(12,2) column type and
//     preserving precision through JSON (docs/08-tradeoffs.md 5.5).
//   - hireDate is `Date` in the row but represents a calendar date with
//     no time component; serialised as YYYY-MM-DD.
//   - createdAt and updatedAt are returned as ISO 8601 datetime strings
//     (z.string().datetime() accepts this form).
const serializeEmployee = (row: EmployeeRow): Employee => ({
  id: row.id,
  email: row.email,
  fullName: row.fullName,
  jobTitle: row.jobTitle,
  // The DB column is a plain CHAR(2) so Prisma types it as `string`, but
  // the API contract guarantees an ISO 3166-1 alpha-2 code because we
  // validate via countrySchema on every write. The cast acknowledges that
  // runtime invariant; an invalid code can only enter the table via a
  // hand-written SQL statement that bypasses the schema.
  country: row.country as ISOCountryCode,
  department: row.department,
  salary: row.salary.toFixed(2),
  employmentType: row.employmentType,
  hireDate: row.hireDate.toISOString().slice(0, 10),
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
});
