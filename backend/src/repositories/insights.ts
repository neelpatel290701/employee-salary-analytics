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
