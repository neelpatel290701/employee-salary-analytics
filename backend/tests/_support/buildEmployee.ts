import type { z } from 'zod';
import { createEmployeeInputSchema } from '@app/shared';

// Test data builder for Employee inputs. Sensible defaults that satisfy
// every validation rule; per-test overrides via the optional `overrides`
// parameter. See docs/06-tdd-strategy.md §9 for the broader pattern.
//
// The counter behind the email guarantees the unique-email constraint is
// not violated incidentally when multiple builds run in the same test.

type EmployeeInputRaw = z.input<typeof createEmployeeInputSchema>;

let counter = 0;

export const buildEmployee = (
  overrides?: Partial<EmployeeInputRaw>,
): EmployeeInputRaw => {
  counter += 1;
  return {
    email: `employee.${counter}@example.com`,
    fullName: 'Priya Ramaswamy',
    jobTitle: 'Senior Software Engineer',
    country: 'IN',
    department: 'ENGINEERING',
    salary: '145000.00',
    employmentType: 'FULL_TIME',
    hireDate: '2022-03-14',
    ...overrides,
  };
};
