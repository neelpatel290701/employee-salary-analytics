import type {
  CountryStats,
  CountryStatsQuery,
  CountryStatsSortBy,
} from '@app/shared';

import { summarize } from '../lib/stats.js';
import { fetchSalariesByCountry } from '../repositories/insights.js';

// Service layer for the insights endpoints. The repository fetches raw
// values; this layer groups them, calls the unit-tested stats primitives,
// applies the requested sort, and serialises every monetary field as a
// two-decimal string consistent with the rest of the API
// (docs/05-api-design.md §5.1).

// Internal shape: numeric, pre-serialisation. Used for sort comparisons
// (which would be awkward against the string-formatted output shape).
type CountryStatsInternal = {
  country: string;
  count: number;
  min: number;
  max: number;
  average: number;
  median: number;
  p25: number;
  p75: number;
  totalPayroll: number;
};

// Map the API-facing sort columns onto the internal numeric field names.
// Keeps the API contract (averageSalary, medianSalary) decoupled from the
// internal field naming (average, median).
const internalSortKey: Record<
  CountryStatsSortBy,
  'count' | 'average' | 'median'
> = {
  count: 'count',
  averageSalary: 'average',
  medianSalary: 'median',
};

export const getCountryStats = async (
  query: CountryStatsQuery,
): Promise<CountryStats[]> => {
  const rows = await fetchSalariesByCountry(query.country);

  // Group salaries by country. One pass, O(n).
  const groups = new Map<string, number[]>();
  for (const row of rows) {
    let group = groups.get(row.country);
    if (!group) {
      group = [];
      groups.set(row.country, group);
    }
    group.push(row.salary);
  }

  // Compute summary stats per group. Groups are non-empty by
  // construction (the key only exists if at least one row was pushed),
  // so summarize() never returns null fields here - the `?? 0`
  // fallbacks are defensive and unreachable in practice.
  const aggregated: CountryStatsInternal[] = [...groups.entries()].map(
    ([country, salaries]) => {
      const summary = summarize(salaries);
      const totalPayroll = salaries.reduce((acc, v) => acc + v, 0);
      return {
        country,
        count: summary.count,
        min: summary.min ?? 0,
        max: summary.max ?? 0,
        average: summary.mean ?? 0,
        median: summary.median ?? 0,
        p25: summary.p25 ?? 0,
        p75: summary.p75 ?? 0,
        totalPayroll,
      };
    },
  );

  // Sort by the requested column. Numeric comparison; the sortOrder
  // controls the sign of the result.
  const sortKey = internalSortKey[query.sortBy];
  aggregated.sort((a, b) => {
    const delta = a[sortKey] - b[sortKey];
    return query.sortOrder === 'asc' ? delta : -delta;
  });

  // Serialise to the API contract: every monetary field becomes a
  // two-decimal string. count stays numeric (it's a sample size).
  return aggregated.map((row) => ({
    country: row.country,
    count: row.count,
    minSalary: row.min.toFixed(2),
    maxSalary: row.max.toFixed(2),
    averageSalary: row.average.toFixed(2),
    medianSalary: row.median.toFixed(2),
    p25Salary: row.p25.toFixed(2),
    p75Salary: row.p75.toFixed(2),
    totalPayrollUsd: row.totalPayroll.toFixed(2),
  }));
};
