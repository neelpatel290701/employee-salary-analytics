import { describe, it, expect, vi, afterEach } from 'vitest';

import {
  countrySchema,
  departmentSchema,
  emailSchema,
  employmentTypeSchema,
  fullNameSchema,
  hireDateSchema,
  jobTitleSchema,
  salarySchema,
} from '../../src/schemas/employee';

// Field-level schemas for the Employee entity. The canonical rules are listed
// in docs/05-api-design.md §7; this file is the executable form of that
// table. Each schema has at least one accept case and one reject case for
// every rule.

afterEach(() => {
  vi.useRealTimers();
});

describe('emailSchema', () => {
  it('accepts a valid email and lowercases it', () => {
    expect(emailSchema.parse('Priya.R@Example.com')).toBe('priya.r@example.com');
  });

  it('trims surrounding whitespace before normalising', () => {
    expect(emailSchema.parse('  priya@example.com  ')).toBe('priya@example.com');
  });

  it('rejects malformed emails', () => {
    expect(() => emailSchema.parse('not-an-email')).toThrow();
    expect(() => emailSchema.parse('@nothing')).toThrow();
    expect(() => emailSchema.parse('priya@')).toThrow();
  });

  it('rejects empty input', () => {
    expect(() => emailSchema.parse('')).toThrow();
  });

  it('rejects emails longer than 254 characters (RFC 5321 cap)', () => {
    const tooLong = 'a'.repeat(245) + '@example.com'; // 257 chars
    expect(() => emailSchema.parse(tooLong)).toThrow();
  });
});

describe('fullNameSchema', () => {
  it('accepts non-empty trimmed names', () => {
    expect(fullNameSchema.parse('Priya Ramaswamy')).toBe('Priya Ramaswamy');
  });

  it('trims surrounding whitespace', () => {
    expect(fullNameSchema.parse('  Priya  ')).toBe('Priya');
  });

  it('accepts single-character names', () => {
    expect(fullNameSchema.parse('A')).toBe('A');
  });

  it('accepts names with diacritics and non-ASCII characters', () => {
    expect(fullNameSchema.parse('Renée García')).toBe('Renée García');
    expect(fullNameSchema.parse('李明')).toBe('李明');
  });

  it('rejects empty input', () => {
    expect(() => fullNameSchema.parse('')).toThrow();
  });

  it('rejects whitespace-only input (which becomes empty after trim)', () => {
    expect(() => fullNameSchema.parse('   ')).toThrow();
  });

  it('rejects names longer than 200 characters', () => {
    expect(() => fullNameSchema.parse('a'.repeat(201))).toThrow();
  });
});

describe('jobTitleSchema', () => {
  it('accepts non-empty trimmed titles', () => {
    expect(jobTitleSchema.parse('Senior Software Engineer')).toBe(
      'Senior Software Engineer',
    );
  });

  it('trims surrounding whitespace', () => {
    expect(jobTitleSchema.parse('  Engineer  ')).toBe('Engineer');
  });

  it('rejects empty input', () => {
    expect(() => jobTitleSchema.parse('')).toThrow();
  });

  it('rejects whitespace-only input', () => {
    expect(() => jobTitleSchema.parse('   ')).toThrow();
  });

  it('rejects titles longer than 100 characters', () => {
    expect(() => jobTitleSchema.parse('a'.repeat(101))).toThrow();
  });
});

describe('countrySchema', () => {
  it('accepts a valid ISO 3166-1 alpha-2 code in uppercase', () => {
    expect(countrySchema.parse('US')).toBe('US');
    expect(countrySchema.parse('IN')).toBe('IN');
    expect(countrySchema.parse('DE')).toBe('DE');
  });

  it('normalises lowercase input to uppercase', () => {
    expect(countrySchema.parse('us')).toBe('US');
    expect(countrySchema.parse('in')).toBe('IN');
  });

  it('rejects codes that are not exactly two letters', () => {
    expect(() => countrySchema.parse('USA')).toThrow();
    expect(() => countrySchema.parse('U')).toThrow();
    expect(() => countrySchema.parse('')).toThrow();
  });

  it('rejects codes that are not in the ISO 3166-1 alpha-2 list', () => {
    expect(() => countrySchema.parse('ZZ')).toThrow();
    expect(() => countrySchema.parse('XX')).toThrow();
  });

  it('rejects codes containing non-letters', () => {
    expect(() => countrySchema.parse('U1')).toThrow();
    expect(() => countrySchema.parse('u_')).toThrow();
  });
});

describe('salarySchema', () => {
  it('accepts a decimal string with two decimals', () => {
    expect(salarySchema.parse('100000.00')).toBe('100000.00');
  });

  it('accepts a decimal string with one decimal', () => {
    expect(salarySchema.parse('100000.5')).toBe('100000.5');
  });

  it('accepts an integer string', () => {
    expect(salarySchema.parse('100000')).toBe('100000');
  });

  it('accepts the schema maximum 9999999999.99', () => {
    expect(salarySchema.parse('9999999999.99')).toBe('9999999999.99');
  });

  it('rejects zero', () => {
    expect(() => salarySchema.parse('0')).toThrow();
    expect(() => salarySchema.parse('0.00')).toThrow();
  });

  it('rejects negative values', () => {
    expect(() => salarySchema.parse('-100')).toThrow();
    expect(() => salarySchema.parse('-0.01')).toThrow();
  });

  it('rejects values with more than two decimal places', () => {
    expect(() => salarySchema.parse('100.123')).toThrow();
  });

  it('rejects values exceeding the schema cap', () => {
    expect(() => salarySchema.parse('10000000000.00')).toThrow();
  });

  it('rejects non-numeric strings', () => {
    expect(() => salarySchema.parse('abc')).toThrow();
    expect(() => salarySchema.parse('100,000.00')).toThrow();
  });
});

describe('hireDateSchema', () => {
  it('accepts a past date in YYYY-MM-DD format', () => {
    expect(hireDateSchema.parse('2022-03-14')).toBe('2022-03-14');
  });

  it("accepts today's date relative to the system clock", () => {
    vi.setSystemTime(new Date('2026-05-29T00:00:00Z'));
    expect(hireDateSchema.parse('2026-05-29')).toBe('2026-05-29');
  });

  it('rejects future dates relative to the system clock', () => {
    vi.setSystemTime(new Date('2026-05-29T00:00:00Z'));
    expect(() => hireDateSchema.parse('2026-05-30')).toThrow();
    expect(() => hireDateSchema.parse('2027-01-01')).toThrow();
  });

  it('rejects malformed date strings', () => {
    expect(() => hireDateSchema.parse('not-a-date')).toThrow();
    expect(() => hireDateSchema.parse('2022/03/14')).toThrow();
    expect(() => hireDateSchema.parse('03-14-2022')).toThrow();
  });

  it('rejects calendar-invalid dates that match the YYYY-MM-DD shape', () => {
    expect(() => hireDateSchema.parse('2022-02-30')).toThrow(); // Feb 30 does not exist
    expect(() => hireDateSchema.parse('2022-13-01')).toThrow(); // month 13 does not exist
    expect(() => hireDateSchema.parse('2022-00-15')).toThrow(); // month 0 does not exist
  });
});

describe('departmentSchema', () => {
  it('accepts every documented enum value', () => {
    const values = [
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
    ];
    for (const v of values) {
      expect(departmentSchema.parse(v)).toBe(v);
    }
  });

  it('rejects unknown values', () => {
    expect(() => departmentSchema.parse('UNKNOWN')).toThrow();
    expect(() => departmentSchema.parse('SECURITY')).toThrow();
  });

  it('is case-sensitive (rejects lowercase)', () => {
    expect(() => departmentSchema.parse('engineering')).toThrow();
  });
});

describe('employmentTypeSchema', () => {
  it('accepts every documented enum value', () => {
    const values = ['FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERN'];
    for (const v of values) {
      expect(employmentTypeSchema.parse(v)).toBe(v);
    }
  });

  it('rejects unknown values', () => {
    expect(() => employmentTypeSchema.parse('VOLUNTEER')).toThrow();
    expect(() => employmentTypeSchema.parse('TEMPORARY')).toThrow();
  });

  it('is case-sensitive (rejects lowercase)', () => {
    expect(() => employmentTypeSchema.parse('full_time')).toThrow();
  });
});
