import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { HttpResponse, http } from 'msw';

import { EmployeesPage } from '../../../src/features/employees/EmployeesPage';
import { server } from '../../_support/server';

// Component tests for the Employees list page. Uses MSW to intercept
// fetch at the network layer per docs/06-tdd-strategy.md §4 so the
// component under test sees a real fetch, just with a mocked response.

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

// Test fixture - matches the Employee shape from
// docs/05-api-design.md §5.1.
const sampleEmployee = (overrides: Partial<Record<string, unknown>> = {}) => ({
  id: 'clw1234567890abcdefghijkl',
  email: 'priya@example.com',
  fullName: 'Priya Ramaswamy',
  jobTitle: 'Senior Engineer',
  country: 'IN',
  department: 'ENGINEERING',
  salary: '145000.00',
  employmentType: 'FULL_TIME',
  hireDate: '2022-03-14',
  createdAt: '2026-05-29T08:31:12.413Z',
  updatedAt: '2026-05-29T08:31:12.413Z',
  ...overrides,
});

const renderPage = () => {
  // Fresh QueryClient per render so cache from one test does not leak
  // into another. retry: false so failed requests do not retry under
  // tests and slow the suite down.
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/employees']}>
        <EmployeesPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
};

describe('EmployeesPage', () => {
  it('renders the table column headers', async () => {
    server.use(
      http.get('/api/employees', () =>
        HttpResponse.json({
          data: [],
          pagination: { page: 1, pageSize: 50, total: 0, totalPages: 0 },
        }),
      ),
    );

    renderPage();

    expect(
      await screen.findByRole('columnheader', { name: /name/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('columnheader', { name: /job title/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('columnheader', { name: /country/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('columnheader', { name: /salary/i }),
    ).toBeInTheDocument();
  });

  it('renders rows from the API response', async () => {
    server.use(
      http.get('/api/employees', () =>
        HttpResponse.json({
          data: [
            sampleEmployee({
              fullName: 'Alice Smith',
              email: 'alice@example.com',
            }),
            sampleEmployee({
              id: 'clw2',
              fullName: 'Bob Jones',
              email: 'bob@example.com',
            }),
          ],
          pagination: { page: 1, pageSize: 50, total: 2, totalPages: 1 },
        }),
      ),
    );

    renderPage();

    expect(await screen.findByText('Alice Smith')).toBeInTheDocument();
    expect(screen.getByText('Bob Jones')).toBeInTheDocument();
  });

  it('shows an empty-state message when there are no employees', async () => {
    server.use(
      http.get('/api/employees', () =>
        HttpResponse.json({
          data: [],
          pagination: { page: 1, pageSize: 50, total: 0, totalPages: 0 },
        }),
      ),
    );

    renderPage();

    // The empty state must not be silent - design principle 6 in
    // docs/02-product-thinking.md: "no empty state without guidance".
    expect(await screen.findByText(/no employees/i)).toBeInTheDocument();
  });

  it('shows the total count in the pagination summary', async () => {
    server.use(
      http.get('/api/employees', () =>
        HttpResponse.json({
          data: [sampleEmployee()],
          pagination: { page: 1, pageSize: 50, total: 99, totalPages: 2 },
        }),
      ),
    );

    renderPage();

    // The persona must see the total - design principle 5 in
    // docs/02-product-thinking.md: "no silent truncation".
    expect(await screen.findByText(/99/)).toBeInTheDocument();
  });

  it('passes the search query to the API when typed into the search input', async () => {
    const observedUrls: string[] = [];
    server.use(
      http.get('/api/employees', ({ request }) => {
        observedUrls.push(request.url);
        return HttpResponse.json({
          data: [],
          pagination: { page: 1, pageSize: 50, total: 0, totalPages: 0 },
        });
      }),
    );

    renderPage();
    const user = userEvent.setup();
    const searchInput = await screen.findByPlaceholderText(/search/i);

    await user.type(searchInput, 'priya');

    await waitFor(() => {
      expect(observedUrls.some((url) => url.includes('search=priya'))).toBe(
        true,
      );
    });
  });

  it('navigates to the next page when "Next" is clicked', async () => {
    const observedUrls: string[] = [];
    server.use(
      http.get('/api/employees', ({ request }) => {
        observedUrls.push(request.url);
        const url = new URL(request.url);
        const page = parseInt(url.searchParams.get('page') ?? '1', 10);
        return HttpResponse.json({
          data: [sampleEmployee()],
          pagination: { page, pageSize: 50, total: 100, totalPages: 2 },
        });
      }),
    );

    renderPage();
    const user = userEvent.setup();
    const nextButton = await screen.findByRole('button', { name: /next/i });

    await user.click(nextButton);

    await waitFor(() => {
      expect(observedUrls.some((url) => url.includes('page=2'))).toBe(true);
    });
  });
});
