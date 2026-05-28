import { useQuery } from '@tanstack/react-query';

import { fetchCountryStats, fetchOutliers, fetchSummary } from './api';

// The "thinking" surface from docs/02-product-thinking.md §5. Composes
// three independent endpoints (summary, country-stats, outliers) - each
// fetched in parallel by TanStack Query so the slowest one bounds the
// dashboard's first-paint, not the sum of all three.

const formatMoney = (value: string): string =>
  `$${Number(value).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const formatNumber = (value: number): string => value.toLocaleString('en-US');

export const InsightsPage = () => {
  const summaryQuery = useQuery({
    queryKey: ['insights', 'summary'],
    queryFn: () => fetchSummary().then((r) => r.data),
  });

  const countryStatsQuery = useQuery({
    queryKey: ['insights', 'country-stats'],
    queryFn: () => fetchCountryStats().then((r) => r.data),
  });

  const outliersQuery = useQuery({
    queryKey: ['insights', 'outliers'],
    queryFn: () => fetchOutliers().then((r) => r.data),
  });

  return (
    <section className="space-y-6">
      <h2 className="text-xl font-semibold">Insights</h2>

      {/* Summary cards: the top-of-page snapshot. Four metrics from
          docs/02 §4.1 - total headcount, total payroll, country count,
          job-title count. Average tenure is intentionally not in the
          headline strip because the persona uses it less often. */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <SummaryCard
          label="Total Employees"
          value={
            summaryQuery.data
              ? formatNumber(summaryQuery.data.totalHeadcount)
              : '—'
          }
        />
        <SummaryCard
          label="Total Annual Payroll"
          value={
            summaryQuery.data
              ? formatMoney(summaryQuery.data.totalAnnualPayrollUsd)
              : '—'
          }
        />
        <SummaryCard
          label="Countries"
          value={
            summaryQuery.data
              ? formatNumber(summaryQuery.data.countryCount)
              : '—'
          }
        />
        <SummaryCard
          label="Job Titles"
          value={
            summaryQuery.data
              ? formatNumber(summaryQuery.data.jobTitleCount)
              : '—'
          }
        />
      </div>

      {/* Country stats: distribution table with mean and median side by
          side per design principle 1 ("show the median next to every
          average"). Every aggregate carries its sample size per
          principle 2 ("every metric has a sample size"). */}
      <section className="overflow-hidden rounded-md border border-slate-200 bg-white">
        <header className="border-b border-slate-200 px-4 py-3">
          <h3 className="font-medium">Salary by country</h3>
        </header>
        {countryStatsQuery.data && countryStatsQuery.data.length === 0 ? (
          <p className="p-8 text-center text-sm text-slate-500">
            No country data yet. Seed the database to populate.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left">
              <tr>
                <th className="px-4 py-2 font-medium">Country</th>
                <th className="px-4 py-2 text-right font-medium">Employees</th>
                <th className="px-4 py-2 text-right font-medium">Average</th>
                <th className="px-4 py-2 text-right font-medium">Median</th>
                <th className="px-4 py-2 text-right font-medium">P25</th>
                <th className="px-4 py-2 text-right font-medium">P75</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {countryStatsQuery.data?.map((row) => (
                <tr key={row.country} className="hover:bg-slate-50">
                  <td className="px-4 py-2 font-medium">{row.country}</td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    {formatNumber(row.count)}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    {formatMoney(row.averageSalary)}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    {formatMoney(row.medianSalary)}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums text-slate-500">
                    {formatMoney(row.p25Salary)}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums text-slate-500">
                    {formatMoney(row.p75Salary)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* Outliers: employees > 2σ from their (country, jobTitle) cohort
          mean. Each row identifies the employee, their salary, and how
          many standard deviations they are from the cohort mean. Design
          principle 7 from docs/02 ("outliers must be actionable") - the
          row carries the employee id internally so a click-through to
          the record is a follow-on commit, not a v2 problem. */}
      <section className="overflow-hidden rounded-md border border-slate-200 bg-white">
        <header className="border-b border-slate-200 px-4 py-3">
          <h3 className="font-medium">Salary outliers</h3>
          <p className="text-xs text-slate-500">
            Employees more than 2 standard deviations from their (country,
            role) cohort mean. Cohorts smaller than 5 are excluded.
          </p>
        </header>
        {outliersQuery.data && outliersQuery.data.length === 0 ? (
          <p className="p-8 text-center text-sm text-slate-500">
            No outliers detected.
          </p>
        ) : (
          <ul className="divide-y divide-slate-200">
            {outliersQuery.data?.map((o) => (
              <li
                key={o.employee.id}
                className="flex items-center justify-between p-4"
              >
                <div>
                  <p className="font-medium">{o.employee.fullName}</p>
                  <p className="text-xs text-slate-500">
                    {o.employee.jobTitle} · {o.employee.country}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-medium tabular-nums">
                    {formatMoney(o.salary)}
                  </p>
                  <p className="text-xs text-slate-500">
                    {o.deviationsFromMean.toFixed(1)}σ {o.direction} cohort
                    mean
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </section>
  );
};

type SummaryCardProps = { label: string; value: string };

const SummaryCard = ({ label, value }: SummaryCardProps) => (
  <div className="rounded-md border border-slate-200 bg-white p-4">
    <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
    <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
  </div>
);
