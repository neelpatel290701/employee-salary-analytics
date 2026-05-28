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

/**
 * A single-pass summary of a numeric series. Used by the country-stats
 * and job-title-stats endpoints to surface every distributional metric
 * the persona's product-thinking doc asks for - count alongside every
 * aggregate, mean and median together so the user sees both the average
 * and the typical value, plus the P25 and P75 quartiles for the spread
 * (docs/02-product-thinking.md §6 design principles 1 and 2).
 */
export type SummaryStats = {
  count: number;
  min: number | null;
  max: number | null;
  mean: number | null;
  median: number | null;
  p25: number | null;
  p75: number | null;
};

const emptySummary: SummaryStats = {
  count: 0,
  min: null,
  max: null,
  mean: null,
  median: null,
  p25: null,
  p75: null,
};

export const summarize = (values: readonly number[]): SummaryStats => {
  if (values.length === 0) return emptySummary;

  // Defensive copy + sort. Defensive so the caller's array is left
  // untouched; sorted-ascending so percentile() can run three times
  // against the same array without paying for sorting on each call.
  const sorted = [...values].sort((a, b) => a - b);
  const sum = sorted.reduce((acc, v) => acc + v, 0);

  return {
    count: sorted.length,
    min: sorted[0]!,
    max: sorted[sorted.length - 1]!,
    mean: sum / sorted.length,
    median: percentile(sorted, 0.5),
    p25: percentile(sorted, 0.25),
    p75: percentile(sorted, 0.75),
  };
};

/**
 * Population standard deviation (divide by N, not N-1). The insights
 * endpoints describe the cohort, they do not estimate a population
 * from a sample, so N is the right divisor.
 *
 * Takes the pre-computed mean to avoid recomputing it - callers already
 * have the mean from summarize().
 *
 * @returns the standard deviation, or null for empty input. n=1 returns
 *          0 because a single point has no deviation from itself.
 */
export const stddev = (
  values: readonly number[],
  mean: number,
): number | null => {
  if (values.length === 0) return null;
  if (values.length === 1) return 0;

  const sumSquaredDiffs = values.reduce(
    (acc, v) => acc + (v - mean) ** 2,
    0,
  );
  return Math.sqrt(sumSquaredDiffs / values.length);
};
