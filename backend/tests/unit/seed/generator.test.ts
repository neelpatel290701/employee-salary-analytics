import { describe, expect, it } from 'vitest';

import {
  createSeededRng,
  generateOne,
} from '../../../src/seed/generator.js';

// Unit tests for the seed-script pure functions per
// docs/06-tdd-strategy.md §2.1. Deterministic with a seeded RNG so two
// invocations with the same seed produce the same output - the property
// the perf-investigation commits rely on (docs/07-performance-plan.md
// §2.4) so successive benchmark runs measure the same workload.

describe('createSeededRng()', () => {
  it('produces a deterministic sequence for a given seed', () => {
    const rng1 = createSeededRng(42);
    const rng2 = createSeededRng(42);

    // The first five draws must match exactly.
    for (let i = 0; i < 5; i++) {
      expect(rng1()).toBe(rng2());
    }
  });

  it('produces a different sequence for a different seed', () => {
    const rng1 = createSeededRng(42);
    const rng2 = createSeededRng(43);

    // At least one of the first few draws should differ. With LCG-class
    // generators identical-seed-identical-output is the contract;
    // different-seed-different-output is overwhelmingly likely but not
    // guaranteed for every single draw. Comparing several lets the test
    // be robust without depending on the specific RNG algorithm.
    let anyDiffer = false;
    for (let i = 0; i < 5; i++) {
      if (rng1() !== rng2()) anyDiffer = true;
    }
    expect(anyDiffer).toBe(true);
  });

  it('returns values in the half-open interval [0, 1)', () => {
    const rng = createSeededRng(42);
    for (let i = 0; i < 1000; i++) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe('generateOne()', () => {
  const firstNames = ['Alice', 'Bob', 'Charlie', 'Diana', 'Eve'];
  const lastNames = ['Smith', 'Jones', 'Brown', 'Davis', 'Evans'];

  it('produces a deterministic employee for a given (seed, index) pair', () => {
    const rngA = createSeededRng(42);
    const rngB = createSeededRng(42);

    const a = generateOne(firstNames, lastNames, rngA, 0);
    const b = generateOne(firstNames, lastNames, rngB, 0);

    expect(a).toEqual(b);
  });

  it('produces unique emails for different indices', () => {
    const rng = createSeededRng(42);

    const a = generateOne(firstNames, lastNames, rng, 0);
    const b = generateOne(firstNames, lastNames, rng, 1);

    expect(a.email).not.toBe(b.email);
  });

  it('produces fullName as a first-name + last-name from the supplied lists', () => {
    const rng = createSeededRng(42);
    const result = generateOne(firstNames, lastNames, rng, 0);

    const parts = result.fullName.split(' ');
    expect(parts).toHaveLength(2);
    expect(firstNames).toContain(parts[0]);
    expect(lastNames).toContain(parts[1]);
  });

  it('produces fields that match the API contract shape', () => {
    const rng = createSeededRng(42);
    const result = generateOne(firstNames, lastNames, rng, 0);

    expect(result).toMatchObject({
      email: expect.stringMatching(/^.+@.+\..+$/),
      fullName: expect.any(String),
      jobTitle: expect.any(String),
      // ISO 3166-1 alpha-2 country code
      country: expect.stringMatching(/^[A-Z]{2}$/),
      department: expect.any(String),
      // Decimal string with two decimal places (DECIMAL(12,2) convention)
      salary: expect.stringMatching(/^\d+\.\d{2}$/),
      employmentType: expect.any(String),
      // YYYY-MM-DD calendar date
      hireDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
    });
  });

  it('generates a positive salary value', () => {
    const rng = createSeededRng(42);
    for (let i = 0; i < 20; i++) {
      const result = generateOne(firstNames, lastNames, rng, i);
      expect(Number(result.salary)).toBeGreaterThan(0);
    }
  });
});
