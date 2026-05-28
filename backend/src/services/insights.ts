import type {
  CountryStats,
  CountryStatsQuery,
  CountryStatsSortBy,
  HeadcountByCountry,
  HeadcountByCountryDepartment,
  HeadcountQuery,
  InsightsSummary,
  JobTitleCount,
  JobTitleStats,
  JobTitleStatsQuery,
  JobTitleStatsSortBy,
  JobTitlesQuery,
  Outlier,
  OutliersQuery,
} from '@app/shared';

import { stddev, summarize } from '../lib/stats.js';
import {
  countByCountry,
  countByCountryAndDepartment,
  fetchEmployeesForOutliers,
  fetchOrgSummaryRaw,
  fetchSalariesByCountry,
  fetchSalariesByCountryAndJobTitle,
  groupJobTitlesByFrequency,
} from '../repositories/insights.js';

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

// ---------------------------------------------------------------------------
// getJobTitleStats - same shape as getCountryStats but groups by jobTitle
// inside a fixed country.
// ---------------------------------------------------------------------------

const jobTitleInternalSortKey: Record<
  JobTitleStatsSortBy,
  'count' | 'average' | 'median'
> = {
  count: 'count',
  averageSalary: 'average',
  medianSalary: 'median',
};

export const getJobTitleStats = async (
  query: JobTitleStatsQuery,
): Promise<JobTitleStats[]> => {
  const rows = await fetchSalariesByCountryAndJobTitle(
    query.country,
    query.jobTitle,
  );

  const groups = new Map<string, number[]>();
  for (const row of rows) {
    let group = groups.get(row.jobTitle);
    if (!group) {
      group = [];
      groups.set(row.jobTitle, group);
    }
    group.push(row.salary);
  }

  const aggregated = [...groups.entries()].map(([jobTitle, salaries]) => {
    const summary = summarize(salaries);
    return {
      jobTitle,
      count: summary.count,
      average: summary.mean ?? 0,
      median: summary.median ?? 0,
      p25: summary.p25 ?? 0,
      p75: summary.p75 ?? 0,
    };
  });

  const sortKey = jobTitleInternalSortKey[query.sortBy];
  aggregated.sort((a, b) => {
    const delta = a[sortKey] - b[sortKey];
    return query.sortOrder === 'asc' ? delta : -delta;
  });

  return aggregated.map((row) => ({
    country: query.country,
    jobTitle: row.jobTitle,
    count: row.count,
    averageSalary: row.average.toFixed(2),
    medianSalary: row.median.toFixed(2),
    p25Salary: row.p25.toFixed(2),
    p75Salary: row.p75.toFixed(2),
  }));
};

// ---------------------------------------------------------------------------
// getHeadcount - either by country or by (country, department) depending
// on the groupBy parameter. The repository functions do the GROUP BY in
// MySQL; the service just picks which one to call and re-shapes the result.
// ---------------------------------------------------------------------------

export const getHeadcount = async (
  query: HeadcountQuery,
): Promise<HeadcountByCountry[] | HeadcountByCountryDepartment[]> => {
  if (query.groupBy === 'country') {
    return countByCountry();
  }
  return countByCountryAndDepartment();
};

// ---------------------------------------------------------------------------
// getSummary - org-wide top-line snapshot. Tenure is averaged in app code
// from the hireDate list rather than via a SQL aggregate; at 10K rows the
// transfer cost is negligible (~80 KB of dates) and keeping it portable
// across databases is worth more than the per-call latency saved.
// ---------------------------------------------------------------------------

const MS_PER_YEAR = 1000 * 60 * 60 * 24 * 365.25;

export const getSummary = async (): Promise<InsightsSummary> => {
  const raw = await fetchOrgSummaryRaw();

  let averageTenureYears = 0;
  if (raw.hireDates.length > 0) {
    const now = Date.now();
    const totalYears = raw.hireDates.reduce((acc, date) => {
      return acc + (now - date.getTime()) / MS_PER_YEAR;
    }, 0);
    averageTenureYears = Number(
      (totalYears / raw.hireDates.length).toFixed(2),
    );
  }

  return {
    totalHeadcount: raw.totalCount,
    totalAnnualPayrollUsd: raw.totalPayroll.toFixed(2),
    averageTenureYears,
    countryCount: raw.countryCount,
    jobTitleCount: raw.jobTitleCount,
    departmentBreakdown: raw.departmentCounts,
  };
};

// ---------------------------------------------------------------------------
// getOutliers - employees more than 2 standard deviations from their
// (country, jobTitle) cohort mean.
//
// Two rules from docs/05-api-design.md §6.5 and the product-thinking doc:
//   1. Cohorts with fewer than 5 employees are excluded - stddev is too
//      noisy at low n to be meaningful (tradeoff 5.8).
//   2. The 2σ threshold is fixed, not a tunable knob. The persona doesn't
//      want a configurable outlier feature; they want an actionable list.
// ---------------------------------------------------------------------------

const MIN_COHORT_SIZE = 5;
const OUTLIER_THRESHOLD_SIGMA = 2;

export const getOutliers = async (
  query: OutliersQuery,
): Promise<Outlier[]> => {
  const employees = await fetchEmployeesForOutliers(query.country);

  // Group by (country, jobTitle) cohort. A pipe-delimited string key is
  // safe because country is a 2-letter ISO code (no pipes) and jobTitle
  // is unlikely to contain a pipe; if it ever did, the worst case is
  // that two cohorts merge incorrectly, which we accept for v1.
  const cohorts = new Map<string, typeof employees>();
  for (const employee of employees) {
    const key = `${employee.country}|${employee.jobTitle}`;
    let cohort = cohorts.get(key);
    if (!cohort) {
      cohort = [];
      cohorts.set(key, cohort);
    }
    cohort.push(employee);
  }

  const outliers: Outlier[] = [];

  for (const cohort of cohorts.values()) {
    if (cohort.length < MIN_COHORT_SIZE) continue;

    const salaries = cohort.map((e) => e.salary);
    const mean = salaries.reduce((a, b) => a + b, 0) / salaries.length;
    const sd = stddev(salaries, mean) ?? 0;

    // A perfectly uniform cohort has stddev = 0 - every member equals
    // the mean, so no one is "beyond" any threshold from it. Skip to
    // avoid divide-by-zero on deviationsFromMean.
    if (sd === 0) continue;

    for (const employee of cohort) {
      const deviations = (employee.salary - mean) / sd;
      const direction: 'above' | 'below' = deviations > 0 ? 'above' : 'below';

      if (Math.abs(deviations) <= OUTLIER_THRESHOLD_SIGMA) continue;
      if (query.direction === 'above' && direction !== 'above') continue;
      if (query.direction === 'below' && direction !== 'below') continue;

      outliers.push({
        employee: {
          id: employee.id,
          fullName: employee.fullName,
          jobTitle: employee.jobTitle,
          country: employee.country,
        },
        salary: employee.salary.toFixed(2),
        cohortMean: mean.toFixed(2),
        cohortStdDev: sd.toFixed(2),
        deviationsFromMean: Number(deviations.toFixed(2)),
        direction,
      });
    }
  }

  // Sort by how far from the mean (descending) so the most-extreme cases
  // surface first - the persona's outlier review is "highest-impact
  // first," not alphabetical.
  outliers.sort(
    (a, b) =>
      Math.abs(b.deviationsFromMean) - Math.abs(a.deviationsFromMean),
  );

  return outliers.slice(0, query.limit);
};

// ---------------------------------------------------------------------------
// getJobTitles - autocomplete data for the create/edit form.
// ---------------------------------------------------------------------------

export const getJobTitles = async (
  query: JobTitlesQuery,
): Promise<JobTitleCount[]> => {
  return groupJobTitlesByFrequency(query.search, query.limit);
};
