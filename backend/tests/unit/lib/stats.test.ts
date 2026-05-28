import { describe, expect, it } from 'vitest';

import { percentile } from '../../../src/lib/stats.js';

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
