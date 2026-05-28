import type { Department, EmploymentType } from '@prisma/client';

// Pure helpers for the seed script. Used both by the seed runner and by
// the integration test, so deterministic output across both contexts is
// non-negotiable - successive benchmark runs must measure the same
// workload, not a re-shuffled one (docs/07-performance-plan.md §2.4).

export type GeneratedEmployee = {
  email: string;
  fullName: string;
  jobTitle: string;
  country: string;
  department: Department;
  salary: string;
  employmentType: EmploymentType;
  hireDate: string;
};

// Linear-congruential generator using Park-Miller "minimal standard"
// constants (multiplier 48271, modulus 2^31 - 1). The modulus is prime
// so the cycle is full-period; we are not doing cryptography here, just
// need reproducible pseudo-randomness for fixture generation.
export const createSeededRng = (seed: number): (() => number) => {
  // Normalise to a positive 32-bit unsigned integer. seed = 0 would
  // collapse the LCG to 0 forever, so we promote it to 1.
  let state = (seed >>> 0) || 1;
  return () => {
    state = (state * 48271) % 0x7fffffff;
    return state / 0x7fffffff;
  };
};

const COUNTRIES = [
  'US', 'IN', 'GB', 'DE', 'FR', 'CA', 'BR', 'JP', 'AU', 'NL',
  'SG', 'IE', 'ES', 'IT', 'MX', 'AR', 'CN', 'KR', 'ZA', 'NG',
] as const;

const DEPARTMENTS: readonly Department[] = [
  'ENGINEERING', 'PRODUCT', 'DESIGN', 'SALES', 'MARKETING',
  'CUSTOMER_SUPPORT', 'FINANCE', 'HR', 'OPERATIONS', 'LEGAL', 'OTHER',
];

const NON_FULL_TIME_TYPES = ['PART_TIME', 'CONTRACT', 'INTERN'] as const;

const JOB_TITLES = [
  'Software Engineer', 'Senior Software Engineer', 'Staff Engineer',
  'Engineering Manager', 'Director of Engineering',
  'Product Manager', 'Senior Product Manager',
  'Product Designer', 'UX Designer', 'Senior UX Designer',
  'Sales Representative', 'Account Executive', 'Sales Manager',
  'Marketing Specialist', 'Marketing Manager', 'Brand Manager',
  'Customer Support Specialist', 'Customer Support Lead',
  'Financial Analyst', 'Accountant', 'Controller',
  'HR Manager', 'Talent Acquisition Specialist',
  'Operations Manager', 'Project Manager',
  'Legal Counsel', 'Senior Legal Counsel',
  'Data Analyst', 'Data Scientist',
] as const;

// Rough salary base by country in USD. The actual generated value
// spreads from base * 0.5 to base * 2.5, giving realistic-looking
// variation without pretending to be a real benchmark. Defaults to a
// middle value if a new country is added without updating this table.
const SALARY_BASE_BY_COUNTRY: Record<string, number> = {
  US: 100000, GB: 80000, DE: 75000, FR: 70000, JP: 80000, CA: 80000,
  AU: 90000, NL: 75000, SG: 85000, IE: 75000, ES: 50000, IT: 55000,
  IN: 30000, BR: 35000, MX: 30000, AR: 25000, CN: 50000, KR: 60000,
  ZA: 40000, NG: 25000,
};

// Fixed reference point for hire dates, chosen so that even when the
// seed is run years from now the generated dates remain in the past.
// The fixture is for development/demo - we are not claiming the dates
// are "as of today." Anchoring lets generateOne stay pure.
const HIRE_DATE_REFERENCE_MS = new Date('2026-05-01T00:00:00Z').getTime();
const TEN_YEARS_DAYS = 365 * 10;
const ONE_DAY_MS = 86400000;

const pick = <T>(arr: readonly T[], rng: () => number): T => {
  return arr[Math.floor(rng() * arr.length)]!;
};

export const generateOne = (
  firstNames: readonly string[],
  lastNames: readonly string[],
  rng: () => number,
  index: number,
): GeneratedEmployee => {
  const firstName = pick(firstNames, rng);
  const lastName = pick(lastNames, rng);
  const country = pick(COUNTRIES, rng);
  const department = pick(DEPARTMENTS, rng);
  const jobTitle = pick(JOB_TITLES, rng);

  // 80% full-time, 20% other. Reflects the typical mix in a workforce
  // and means the analytics endpoints can be exercised against a
  // realistic distribution.
  const employmentType: EmploymentType =
    rng() < 0.8 ? 'FULL_TIME' : pick(NON_FULL_TIME_TYPES, rng);

  const base = SALARY_BASE_BY_COUNTRY[country] ?? 50000;
  const multiplier = 0.5 + rng() * 2;
  const salaryNum = Math.round(base * multiplier * 100) / 100;

  const daysAgo = Math.floor(rng() * TEN_YEARS_DAYS);
  const hireDateMs = HIRE_DATE_REFERENCE_MS - daysAgo * ONE_DAY_MS;
  const hireDate = new Date(hireDateMs).toISOString().slice(0, 10);

  return {
    // Email uses the index, not the RNG, so uniqueness is guaranteed
    // regardless of RNG behaviour or list size. The "employee.N" prefix
    // matches the @example.com TLD which RFC 2606 reserves for test
    // and documentation use.
    email: `employee.${index}@example.com`,
    fullName: `${firstName} ${lastName}`,
    jobTitle,
    country,
    department,
    salary: salaryNum.toFixed(2),
    employmentType,
    hireDate,
  };
};
