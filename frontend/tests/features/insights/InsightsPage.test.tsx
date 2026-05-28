import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { HttpResponse, http } from 'msw';

import { InsightsPage } from '../../../src/features/insights/InsightsPage';
import { server } from '../../_support/server';

// Component tests for the Insights dashboard - the "thinking" surface
// from docs/02-product-thinking.md §5. The page composes three API
// endpoints (summary, country-stats, outliers) so each test stubs all
// three and asserts the parts that endpoint feeds into.

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

// Three reusable empty-response handlers. Tests use these for the
// endpoints whose data they do not care about, and override one of them
// with non-empty data for the endpoint under test.

const emptySummary = () =>
  HttpResponse.json({
    data: {
      totalHeadcount: 0,
      totalAnnualPayrollUsd: '0.00',
      averageTenureYears: 0,
      countryCount: 0,
      jobTitleCount: 0,
      departmentBreakdown: [],
    },
  });

const emptyCountryStats = () => HttpResponse.json({ data: [] });
const emptyOutliers = () => HttpResponse.json({ data: [] });

const renderPage = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/insights']}>
        <InsightsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
};

describe('InsightsPage', () => {
  it('renders summary card values from the API', async () => {
    server.use(
      http.get('/api/insights/summary', () =>
        HttpResponse.json({
          data: {
            totalHeadcount: 1234,
            totalAnnualPayrollUsd: '99000000.00',
            averageTenureYears: 3.4,
            countryCount: 42,
            jobTitleCount: 87,
            departmentBreakdown: [],
          },
        }),
      ),
      http.get('/api/insights/country-stats', emptyCountryStats),
      http.get('/api/insights/outliers', emptyOutliers),
    );

    renderPage();

    // Locale-formatted totalHeadcount - "1,234" not "1234". The persona
    // sees comma-grouped numbers everywhere else in the app, so the
    // summary must too.
    expect(await screen.findByText(/1,234/)).toBeInTheDocument();
    expect(screen.getByText(/42/)).toBeInTheDocument();
    expect(screen.getByText(/87/)).toBeInTheDocument();
  });

  it('renders a row for each country in the country stats response', async () => {
    server.use(
      http.get('/api/insights/summary', emptySummary),
      http.get('/api/insights/country-stats', () =>
        HttpResponse.json({
          data: [
            {
              country: 'US',
              count: 100,
              minSalary: '50000.00',
              maxSalary: '200000.00',
              averageSalary: '120000.00',
              medianSalary: '115000.00',
              p25Salary: '85000.00',
              p75Salary: '150000.00',
              totalPayrollUsd: '12000000.00',
            },
            {
              country: 'IN',
              count: 50,
              minSalary: '20000.00',
              maxSalary: '80000.00',
              averageSalary: '45000.00',
              medianSalary: '42000.00',
              p25Salary: '32000.00',
              p75Salary: '58000.00',
              totalPayrollUsd: '2250000.00',
            },
          ],
        }),
      ),
      http.get('/api/insights/outliers', emptyOutliers),
    );

    renderPage();

    expect(await screen.findByText('US')).toBeInTheDocument();
    expect(screen.getByText('IN')).toBeInTheDocument();
  });

  it('renders the averageSalary value for each country', async () => {
    server.use(
      http.get('/api/insights/summary', emptySummary),
      http.get('/api/insights/country-stats', () =>
        HttpResponse.json({
          data: [
            {
              country: 'US',
              count: 100,
              minSalary: '50000.00',
              maxSalary: '200000.00',
              averageSalary: '120000.00',
              medianSalary: '115000.00',
              p25Salary: '85000.00',
              p75Salary: '150000.00',
              totalPayrollUsd: '12000000.00',
            },
          ],
        }),
      ),
      http.get('/api/insights/outliers', emptyOutliers),
    );

    renderPage();

    // 120,000 visible - design principle 1 from docs/02 ("show the
    // median next to every average") means both must reach the user;
    // here we pin down the average specifically.
    expect(await screen.findByText(/120,000/)).toBeInTheDocument();
  });

  it('renders outlier rows with the employee name', async () => {
    server.use(
      http.get('/api/insights/summary', emptySummary),
      http.get('/api/insights/country-stats', emptyCountryStats),
      http.get('/api/insights/outliers', () =>
        HttpResponse.json({
          data: [
            {
              employee: {
                id: 'clw1234567890abcdefghijkl',
                fullName: 'Priya Ramaswamy',
                jobTitle: 'Senior Engineer',
                country: 'IN',
              },
              salary: '500000.00',
              cohortMean: '100000.00',
              cohortStdDev: '50000.00',
              deviationsFromMean: 8,
              direction: 'above',
            },
          ],
        }),
      ),
    );

    renderPage();

    // Outlier row must carry the employee's name so the persona can
    // recognise the record - design principle 7 ("outliers must be
    // actionable"). The id is in the row too for click-through but we
    // are not asserting click-through here, just the visible name.
    expect(await screen.findByText('Priya Ramaswamy')).toBeInTheDocument();
  });
});
