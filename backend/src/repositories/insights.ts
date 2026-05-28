import type { Department } from '@prisma/client';

import { prisma } from '../db/prisma.js';

// Repository for the insights endpoints. The aggregations themselves are
// computed in application code via the stats library (docs/04-data-model.md
// §1.2 explains why - MySQL 8 has no native PERCENTILE_CONT and the
// app-side compute is both cheaper and easier to test at our scale). This
// repo's job is to fetch the raw values the service needs to summarise.

// Fetch (country, salary) pairs for every employee, optionally filtered by
// country. Returns plain numbers - Prisma's Decimal column is converted at
// the boundary so the service layer does not have to deal with Decimal
// arithmetic. Salaries cap at 9,999,999,999.99 (~10^10) and JS numbers are
// safe up to 2^53 (~9 × 10^15), so the conversion is exact at our domain
// range; the small float quirks at the 17th decimal are hidden by the
// service's toFixed(2) serialisation.
export const fetchSalariesByCountry = async (
  country?: string,
): Promise<{ country: string; salary: number }[]> => {
  const rows = await prisma.employee.findMany({
    where: country ? { country } : undefined,
    select: { country: true, salary: true },
  });

  return rows.map((row) => ({
    country: row.country,
    salary: Number(row.salary),
  }));
};

// Same as fetchSalariesByCountry but adds the jobTitle dimension. Used by
// the job-title-stats endpoint where country is required and jobTitle is
// the optional drill-down.
export const fetchSalariesByCountryAndJobTitle = async (
  country: string,
  jobTitle?: string,
): Promise<{ country: string; jobTitle: string; salary: number }[]> => {
  const rows = await prisma.employee.findMany({
    where: { country, ...(jobTitle ? { jobTitle } : {}) },
    select: { country: true, jobTitle: true, salary: true },
  });

  return rows.map((row) => ({
    country: row.country,
    jobTitle: row.jobTitle,
    salary: Number(row.salary),
  }));
};

// Headcount by country. Uses Prisma's groupBy + _count so the work
// happens in MySQL, not in app code.
export const countByCountry = async (): Promise<
  { country: string; count: number }[]
> => {
  const rows = await prisma.employee.groupBy({
    by: ['country'],
    _count: { _all: true },
    orderBy: { country: 'asc' },
  });
  return rows.map((r) => ({ country: r.country, count: r._count._all }));
};

// Headcount by (country, department).
export const countByCountryAndDepartment = async (): Promise<
  { country: string; department: Department; count: number }[]
> => {
  const rows = await prisma.employee.groupBy({
    by: ['country', 'department'],
    _count: { _all: true },
    orderBy: [{ country: 'asc' }, { department: 'asc' }],
  });
  return rows.map((r) => ({
    country: r.country,
    department: r.department,
    count: r._count._all,
  }));
};

// Org-wide summary primitives. Six queries in parallel via Promise.all -
// none depend on each other so the wall-clock latency is the slowest
// single query rather than the sum.
export const fetchOrgSummaryRaw = async (): Promise<{
  totalCount: number;
  totalPayroll: number;
  countryCount: number;
  jobTitleCount: number;
  departmentCounts: { department: Department; count: number }[];
  hireDates: Date[];
}> => {
  const [
    totalCount,
    payrollAgg,
    countries,
    jobTitles,
    departmentCounts,
    hireDates,
  ] = await Promise.all([
    prisma.employee.count(),
    prisma.employee.aggregate({ _sum: { salary: true } }),
    prisma.employee.groupBy({ by: ['country'] }),
    prisma.employee.groupBy({ by: ['jobTitle'] }),
    prisma.employee.groupBy({
      by: ['department'],
      _count: { _all: true },
      orderBy: { department: 'asc' },
    }),
    prisma.employee.findMany({ select: { hireDate: true } }),
  ]);

  return {
    totalCount,
    totalPayroll: Number(payrollAgg._sum.salary ?? 0),
    countryCount: countries.length,
    jobTitleCount: jobTitles.length,
    departmentCounts: departmentCounts.map((d) => ({
      department: d.department,
      count: d._count._all,
    })),
    hireDates: hireDates.map((h) => h.hireDate),
  };
};

// Fetch the employee records the outlier endpoint needs to classify.
// Returns the minimum projection - id + identity fields + salary - so the
// payload stays small even at 10K rows.
export const fetchEmployeesForOutliers = async (
  country?: string,
): Promise<
  {
    id: string;
    fullName: string;
    jobTitle: string;
    country: string;
    salary: number;
  }[]
> => {
  const rows = await prisma.employee.findMany({
    where: country ? { country } : undefined,
    select: {
      id: true,
      fullName: true,
      jobTitle: true,
      country: true,
      salary: true,
    },
  });

  return rows.map((r) => ({
    id: r.id,
    fullName: r.fullName,
    jobTitle: r.jobTitle,
    country: r.country,
    salary: Number(r.salary),
  }));
};

// Distinct job titles with frequency counts, used by the autocomplete
// endpoint. Ordered by count descending so the most common titles appear
// first; the persona typing "Sen" sees "Senior Software Engineer" before
// any one-off variations.
export const groupJobTitlesByFrequency = async (
  search: string | undefined,
  limit: number,
): Promise<{ jobTitle: string; count: number }[]> => {
  const rows = await prisma.employee.groupBy({
    by: ['jobTitle'],
    where: search ? { jobTitle: { startsWith: search } } : undefined,
    _count: { _all: true },
    orderBy: { _count: { jobTitle: 'desc' } },
    take: limit,
  });

  return rows.map((r) => ({ jobTitle: r.jobTitle, count: r._count._all }));
};
