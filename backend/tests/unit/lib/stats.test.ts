import { describe, expect, it } from 'vitest';

import { percentile, stddev, summarize } from '../../../src/lib/stats.js';

// Unit tests for the percentile() primitive. Pure function, no I/O.
//
// Per docs/06-tdd-strategy.md §10, every expected value below is derived
// in a comment above the assertion so a reader does not have to redo the
// arithmetic to know whether the test is asserting the right thing. The
// fixtures are deliberately small (3-8 values) so the math fits in a
// single human read.

describe('percentile()', () => {
  it('returns the middle value as P50 for odd n', () => {
    // n=5 sorted: positions 0..4. P50 index = (5-1)*0.5 = 2 → value at
    // index 2 = 30.
    expect(percentile([10, 20, 30, 40, 50], 0.5)).toBe(30);
  });

  it('returns the linear interpolation between the two middle values for even n', () => {
    // n=4 sorted: positions 0..3. P50 index = (4-1)*0.5 = 1.5 →
    // interpolate between values[1]=20 and values[2]=30 →
    // 20 + 0.5*(30-20) = 25.
    expect(percentile([10, 20, 30, 40], 0.5)).toBe(25);
  });

  it('returns P25 by linear interpolation', () => {
    // n=5 sorted. P25 index = (5-1)*0.25 = 1 → value at index 1 = 20.
    expect(percentile([10, 20, 30, 40, 50], 0.25)).toBe(20);
  });

  it('returns P75 by linear interpolation', () => {
    // n=5 sorted. P75 index = (5-1)*0.75 = 3 → value at index 3 = 40.
    expect(percentile([10, 20, 30, 40, 50], 0.75)).toBe(40);
  });

  it('interpolates between two values when the index is fractional', () => {
    // n=4 sorted. P25 index = (4-1)*0.25 = 0.75 → interpolate between
    // values[0]=10 and values[1]=20 → 10 + 0.75*(20-10) = 17.5.
    expect(percentile([10, 20, 30, 40], 0.25)).toBe(17.5);

    // n=4 sorted. P75 index = (4-1)*0.75 = 2.25 → interpolate between
    // values[2]=30 and values[3]=40 → 30 + 0.25*(40-30) = 32.5.
    expect(percentile([10, 20, 30, 40], 0.75)).toBe(32.5);
  });

  it('returns null for an empty input', () => {
    expect(percentile([], 0.5)).toBeNull();
    expect(percentile([], 0.25)).toBeNull();
    expect(percentile([], 0.75)).toBeNull();
  });

  it('returns the only value when n=1 (every percentile is the same point)', () => {
    expect(percentile([42], 0.5)).toBe(42);
    expect(percentile([42], 0.25)).toBe(42);
    expect(percentile([42], 0.75)).toBe(42);
    expect(percentile([42], 0)).toBe(42);
    expect(percentile([42], 1)).toBe(42);
  });

  it('returns the boundary values for p=0 and p=1', () => {
    // p=0 is the minimum; p=1 is the maximum. No interpolation needed.
    expect(percentile([10, 20, 30, 40, 50], 0)).toBe(10);
    expect(percentile([10, 20, 30, 40, 50], 1)).toBe(50);
  });

  it('handles realistic salary fixtures without floating-point drift', () => {
    // Hand-computed: [50000, 75000, 100000, 125000, 150000]
    //   P50 (median) index = 4*0.5 = 2 → 100000
    //   P25 index = 4*0.25 = 1 → 75000
    //   P75 index = 4*0.75 = 3 → 125000
    expect(percentile([50000, 75000, 100000, 125000, 150000], 0.5)).toBe(100000);
    expect(percentile([50000, 75000, 100000, 125000, 150000], 0.25)).toBe(75000);
    expect(percentile([50000, 75000, 100000, 125000, 150000], 0.75)).toBe(125000);
  });
});

describe('summarize()', () => {
  it('returns all statistics for a typical input', () => {
    // [10, 20, 30, 40, 50]:
    //   count = 5
    //   min   = 10, max = 50
    //   mean  = (10+20+30+40+50)/5 = 150/5 = 30
    //   p50   = sorted[4*0.5=2] = 30
    //   p25   = sorted[4*0.25=1] = 20
    //   p75   = sorted[4*0.75=3] = 40
    expect(summarize([10, 20, 30, 40, 50])).toEqual({
      count: 5,
      min: 10,
      max: 50,
      mean: 30,
      median: 30,
      p25: 20,
      p75: 40,
    });
  });

  it('returns null statistics for an empty input', () => {
    expect(summarize([])).toEqual({
      count: 0,
      min: null,
      max: null,
      mean: null,
      median: null,
      p25: null,
      p75: null,
    });
  });

  it('handles a single value (every aggregate is the value)', () => {
    expect(summarize([42])).toEqual({
      count: 1,
      min: 42,
      max: 42,
      mean: 42,
      median: 42,
      p25: 42,
      p75: 42,
    });
  });

  it('sorts the input internally so unsorted input still gives correct stats', () => {
    // Same values as the typical-input test but scrambled. Sorting once
    // inside summarize() means callers can pass salaries straight from
    // the DB without pre-sorting.
    expect(summarize([50, 30, 10, 20, 40])).toEqual({
      count: 5,
      min: 10,
      max: 50,
      mean: 30,
      median: 30,
      p25: 20,
      p75: 40,
    });
  });

  it('does not mutate the input array', () => {
    // Defensive sort inside summarize() must not change the caller's
    // array. Callers may be iterating over the same array elsewhere.
    const input = [50, 30, 10, 20, 40];
    summarize(input);
    expect(input).toEqual([50, 30, 10, 20, 40]);
  });

  it('handles a realistic salary fixture', () => {
    // [50000, 60000, 70000, 80000, 90000]:
    //   count = 5, min = 50000, max = 90000
    //   mean  = 350000 / 5 = 70000
    //   p50   = 70000, p25 = 60000, p75 = 80000
    expect(summarize([50000, 60000, 70000, 80000, 90000])).toEqual({
      count: 5,
      min: 50000,
      max: 90000,
      mean: 70000,
      median: 70000,
      p25: 60000,
      p75: 80000,
    });
  });
});

describe('stddev()', () => {
  it('computes population standard deviation correctly', () => {
    // Classic textbook fixture: [2, 4, 4, 4, 5, 5, 7, 9]
    //   mean        = 40 / 8 = 5
    //   deviations  = [-3, -1, -1, -1, 0, 0, 2, 4]
    //   squared     = [9, 1, 1, 1, 0, 0, 4, 16] = 32
    //   variance    = 32 / 8 = 4   (population, divide by N, not N-1)
    //   stddev      = sqrt(4) = 2
    expect(stddev([2, 4, 4, 4, 5, 5, 7, 9], 5)).toBe(2);
  });

  it('returns 0 for a single value (a single point has no deviation)', () => {
    expect(stddev([5], 5)).toBe(0);
  });

  it('returns null for empty input', () => {
    expect(stddev([], 0)).toBeNull();
  });

  it('handles a realistic salary fixture', () => {
    // [50000, 60000, 70000, 80000, 90000]:
    //   mean        = 70000 (precomputed by summarize)
    //   deviations  = [-20000, -10000, 0, 10000, 20000]
    //   squared     = [4e8, 1e8, 0, 1e8, 4e8] = 1e9
    //   variance    = 1e9 / 5 = 2e8
    //   stddev      = sqrt(2e8) ≈ 14142.135623...
    expect(
      stddev([50000, 60000, 70000, 80000, 90000], 70000),
    ).toBeCloseTo(14142.13, 2);
  });
});
