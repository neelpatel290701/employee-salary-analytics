import { z } from 'zod';

import { isISOCountryCode } from '../data/iso-countries.js';

// Field-level schemas for the Employee entity. Each schema corresponds to a
// row in the validation table in docs/05-api-design.md §7, and to a column
// in the data-model in docs/04-data-model.md §2.1.
//
// The composed Create / Update / Employee schemas land in a later commit;
// this file owns the per-field rules.

// --- email -----------------------------------------------------------------
// Trim, lowercase, validate as a permissive RFC-shaped email, cap at the
// RFC 5321 practical maximum of 254 characters. Normalising at the schema
// boundary means uniqueness checks downstream are case-insensitive by
// construction.
export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email({ message: 'Must be a valid email address' })
  .max(254, { message: 'Email must be at most 254 characters' });

// --- fullName --------------------------------------------------------------
// Trim and require at least one character. fullName is one field (not first
// + last) so the schema is honest about global naming conventions - see
// tradeoff 4.2 in docs/08-tradeoffs.md.
export const fullNameSchema = z
  .string()
  .trim()
  .min(1, { message: 'Full name is required' })
  .max(200, { message: 'Full name must be at most 200 characters' });

// --- jobTitle --------------------------------------------------------------
export const jobTitleSchema = z
  .string()
  .trim()
  .min(1, { message: 'Job title is required' })
  .max(100, { message: 'Job title must be at most 100 characters' });

// --- country ---------------------------------------------------------------
// Accept lowercase and normalise to uppercase, then validate against the
// static ISO 3166-1 alpha-2 list. Order matters: length and shape are checked
// on the raw input (so "U_" fails on the regex before reaching the transform),
// the transform applies uppercase, and the refine checks ISO membership on
// the normalised value.
export const countrySchema = z
  .string()
  .length(2, { message: 'Country code must be exactly 2 characters' })
  .regex(/^[A-Za-z]{2}$/, { message: 'Country code must be two letters' })
  .transform((s) => s.toUpperCase())
  .refine(isISOCountryCode, {
    message: 'Invalid ISO 3166-1 alpha-2 country code',
  });

// --- salary ----------------------------------------------------------------
// Decimal string, not a number, so DECIMAL(12,2) precision survives the wire
// (docs/04-data-model.md §2.1, docs/05-api-design.md §5.1). The regex
// guarantees the shape (no leading zeros, at most two decimal places, no
// signs, no thousands separators); the refines then enforce the range:
// strictly positive and at most 9,999,999,999.99.
const SALARY_MAX = 9_999_999_999.99;

export const salarySchema = z
  .string()
  .regex(/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/, {
    message:
      'Salary must be a positive decimal with at most two decimal places',
  })
  .refine((s) => Number(s) > 0, { message: 'Salary must be greater than 0' })
  .refine((s) => Number(s) <= SALARY_MAX, {
    message: `Salary must not exceed ${SALARY_MAX}`,
  });

// --- hireDate --------------------------------------------------------------
// YYYY-MM-DD only; the schema rejects shapes JS would silently coerce (e.g.
// "2022/03/14"), calendar-invalid dates that JS would roll over (e.g.
// "2022-02-30" becoming 2022-03-02), and any date strictly in the future
// relative to the system clock. The future check uses UTC midnight on both
// sides so the comparison is timezone-independent.
export const hireDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'Date must be in YYYY-MM-DD format',
  })
  .refine(
    (s) => {
      const date = new Date(`${s}T00:00:00Z`);
      if (Number.isNaN(date.getTime())) return false;
      // Round-trip check catches values JS would otherwise normalise
      // (2022-02-30 -> 2022-03-02, 2022-00-15 -> 2021-12-15, etc.).
      return date.toISOString().slice(0, 10) === s;
    },
    { message: 'Not a valid calendar date' },
  )
  .refine(
    (s) => {
      const date = new Date(`${s}T00:00:00Z`);
      const today = new Date();
      today.setUTCHours(0, 0, 0, 0);
      return date.getTime() <= today.getTime();
    },
    { message: 'Hire date cannot be in the future' },
  );

// --- department ------------------------------------------------------------
// Enum, controlled vocabulary, case-sensitive. Adding a department is a
// migration - see docs/08-tradeoffs.md 4.4.
export const departmentSchema = z.enum([
  'ENGINEERING',
  'PRODUCT',
  'DESIGN',
  'SALES',
  'MARKETING',
  'CUSTOMER_SUPPORT',
  'FINANCE',
  'HR',
  'OPERATIONS',
  'LEGAL',
  'OTHER',
]);

export type Department = z.infer<typeof departmentSchema>;

// --- employmentType --------------------------------------------------------
export const employmentTypeSchema = z.enum([
  'FULL_TIME',
  'PART_TIME',
  'CONTRACT',
  'INTERN',
]);

export type EmploymentType = z.infer<typeof employmentTypeSchema>;

// ===========================================================================
// Composed schemas
// ===========================================================================
//
// The three shapes the API contracts in docs/05-api-design.md §5 commit to:
//
//   createEmployeeInputSchema  - POST /api/employees body
//   updateEmployeeInputSchema  - PATCH /api/employees/:id body
//   employeeSchema             - the resource shape returned by GET endpoints
//
// All three use .strict() so unknown fields produce a VALIDATION_FAILED
// error rather than being silently dropped (docs/05-api-design.md §1
// principle 5: "no magic").

// --- createEmployeeInputSchema --------------------------------------------
// employmentType has a default of FULL_TIME because the brief's persona
// (HR Manager) deals overwhelmingly in full-time hires - making the field
// optional on input with a sensible default speeds the most common write
// (Journey 1 in docs/02-product-thinking.md §3).
export const createEmployeeInputSchema = z
  .object({
    email: emailSchema,
    fullName: fullNameSchema,
    jobTitle: jobTitleSchema,
    country: countrySchema,
    department: departmentSchema,
    salary: salarySchema,
    employmentType: employmentTypeSchema.default('FULL_TIME'),
    hireDate: hireDateSchema,
  })
  .strict();

export type CreateEmployeeInput = z.infer<typeof createEmployeeInputSchema>;

// --- updateEmployeeInputSchema --------------------------------------------
// Every field is truly optional here - PATCH semantics, "only change the
// fields I provide." Empty bodies are rejected by an object-level refine
// because a no-op PATCH is almost always a bug.
//
// Order matters in the chain: .strict() must precede .refine(). Calling
// .strict() on a ZodEffects returned by .refine() would not propagate the
// strict-keys check; the order below ensures unknown fields raise the
// VALIDATION_FAILED error before the "at least one field" refine runs.
export const updateEmployeeInputSchema = z
  .object({
    email: emailSchema.optional(),
    fullName: fullNameSchema.optional(),
    jobTitle: jobTitleSchema.optional(),
    country: countrySchema.optional(),
    department: departmentSchema.optional(),
    salary: salarySchema.optional(),
    employmentType: employmentTypeSchema.optional(),
    hireDate: hireDateSchema.optional(),
  })
  .strict()
  .refine((obj) => Object.keys(obj).length > 0, {
    message: 'At least one field is required',
  });

export type UpdateEmployeeInput = z.infer<typeof updateEmployeeInputSchema>;

// --- employeeSchema --------------------------------------------------------
// The shape returned by GET endpoints and round-tripped through the wire.
// id is intentionally validated as a non-empty string rather than against
// a CUID-specific regex: the format is owned by Prisma's @default(cuid()),
// not by us, and constraining it here would only break the day Prisma
// changes its default. createdAt/updatedAt are ISO 8601 strings with a
// time component - date-only "2026-05-29" is rejected.
export const employeeSchema = z
  .object({
    id: z.string().min(1, { message: 'id is required' }),
    email: emailSchema,
    fullName: fullNameSchema,
    jobTitle: jobTitleSchema,
    country: countrySchema,
    department: departmentSchema,
    salary: salarySchema,
    employmentType: employmentTypeSchema,
    hireDate: hireDateSchema,
    createdAt: z
      .string()
      .datetime({ message: 'createdAt must be an ISO 8601 datetime' }),
    updatedAt: z
      .string()
      .datetime({ message: 'updatedAt must be an ISO 8601 datetime' }),
  })
  .strict();

export type Employee = z.infer<typeof employeeSchema>;

// ===========================================================================
// List query schema
// ===========================================================================
//
// Query parameters for GET /api/employees. Contract: docs/05-api-design.md
// §5.1. Strings come in from the URL so numeric values are coerced via
// z.coerce.*; defaults match the documented values; the object is strict
// so a typo like ?contry=US returns 422 rather than silently returning
// everything.

// minSalary and maxSalary share the same shape but accept zero (unlike
// salarySchema which requires strictly positive values for employee records).
const SALARY_FILTER_MAX = 9_999_999_999.99;
const salaryFilterSchema = z
  .string()
  .regex(/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/, {
    message: 'Must be a non-negative decimal with at most two decimal places',
  })
  .refine((s) => Number(s) <= SALARY_FILTER_MAX, {
    message: `Must not exceed ${SALARY_FILTER_MAX}`,
  });

// Closed whitelist of columns clients can sort by. Anything outside this set
// is a 422 - the URL must never decide an arbitrary column name to ORDER BY
// (docs/05-api-design.md §2.7, also tradeoff 5.6 on no-magic).
export const sortableEmployeeColumnSchema = z.enum([
  'fullName',
  'salary',
  'hireDate',
  'createdAt',
  'updatedAt',
]);

export type SortableEmployeeColumn = z.infer<typeof sortableEmployeeColumnSchema>;

export const sortOrderSchema = z.enum(['asc', 'desc']);
export type SortOrder = z.infer<typeof sortOrderSchema>;

export const listEmployeesQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(200).default(50),
    search: z.string().trim().min(1).max(100).optional(),
    country: countrySchema.optional(),
    jobTitle: z.string().trim().min(1).max(100).optional(),
    department: departmentSchema.optional(),
    employmentType: employmentTypeSchema.optional(),
    minSalary: salaryFilterSchema.optional(),
    maxSalary: salaryFilterSchema.optional(),
    sortBy: sortableEmployeeColumnSchema.default('createdAt'),
    sortOrder: sortOrderSchema.default('desc'),
  })
  .strict()
  .refine(
    (data) => {
      if (data.minSalary !== undefined && data.maxSalary !== undefined) {
        return Number(data.minSalary) <= Number(data.maxSalary);
      }
      return true;
    },
    {
      message: 'minSalary must not be greater than maxSalary',
      path: ['minSalary'],
    },
  );

export type ListEmployeesQuery = z.infer<typeof listEmployeesQuerySchema>;
