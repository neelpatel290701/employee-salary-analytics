// Pure statistics primitives for the insights endpoints. No I/O, no
// dependencies on Prisma or Express - the math lives here so it can be
// unit-tested in isolation against hand-computed fixtures
// (docs/06-tdd-strategy.md §10).

/**
 * Computes the p-th percentile of a sorted-ascending numeric array using
 * linear interpolation between adjacent values - the same algorithm scipy
 * uses with method='linear' and NumPy uses by default.
 *
 * The index for percentile p over an array of length n is (n-1)*p:
 *   - p=0   → index 0      (the minimum)
 *   - p=1   → index n-1    (the maximum)
 *   - p=0.5 → index (n-1)/2 (the median - the middle for odd n, the
 *             average of the two middle values for even n)
 *
 * Fractional indices interpolate linearly between the two surrounding
 * values: idx=1.5 over [10, 20, 30] yields 20 + 0.5*(30-20) = 25.
 *
 * Expects sorted-ascending input. The caller sorts once and reuses the
 * sorted array across multiple percentile calls; the function does not
 * defensively re-sort. This makes summarize() (next commit pair) able to
 * compute min, max, mean, median, p25, p75 in a single sort.
 *
 * @param sorted - sorted-ascending array of numbers
 * @param p      - percentile as a fraction in [0, 1]
 * @returns the percentile value, or null for empty input
 */
export const percentile = (
  sorted: readonly number[],
  p: number,
): number | null => {
  if (sorted.length === 0) return null;
  if (sorted.length === 1) return sorted[0]!;

  const idx = (sorted.length - 1) * p;
  const lower = Math.floor(idx);
  const upper = Math.ceil(idx);

  // Integer index - no interpolation needed (covers p=0, p=1, and all
  // indices that land cleanly on a sorted-array position).
  if (lower === upper) return sorted[lower]!;

  // Fractional index - linear interpolation between the two surrounding
  // values.
  const weight = idx - lower;
  return sorted[lower]! + weight * (sorted[upper]! - sorted[lower]!);
};
