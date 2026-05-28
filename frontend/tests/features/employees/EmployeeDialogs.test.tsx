import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { HttpResponse, http } from 'msw';

import { EmployeesPage } from '../../../src/features/employees/EmployeesPage';
import { server } from '../../_support/server';

// Component tests for the Create / Edit / Delete dialogs triggered from
// EmployeesPage. The dialogs are part of the same feature as the page so
// they live in the same MemoryRouter / QueryClientProvider tree as the
// list - the tests render the page, click a button, then assert on the
// dialog and its outcomes.

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

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

const emptyListResponse = () =>
  HttpResponse.json({
    data: [],
    pagination: { page: 1, pageSize: 50, total: 0, totalPages: 0 },
  });

const listWith = (employees: Array<ReturnType<typeof sampleEmployee>>) =>
  HttpResponse.json({
    data: employees,
    pagination: {
      page: 1,
      pageSize: 50,
      total: employees.length,
      totalPages: 1,
    },
  });

const renderPage = () => {
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

describe('Create employee dialog', () => {
  it('opens a dialog when the Add Employee button is clicked', async () => {
    server.use(http.get('/api/employees', emptyListResponse));

    renderPage();
    const user = userEvent.setup();

    const addButton = await screen.findByRole('button', {
      name: /add employee/i,
    });
    await user.click(addButton);

    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });

  it('submits the form and posts the new employee to the API', async () => {
    let posted: Record<string, unknown> | null = null;
    server.use(
      http.get('/api/employees', emptyListResponse),
      http.post('/api/employees', async ({ request }) => {
        posted = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ data: sampleEmployee(posted) }, { status: 201 });
      }),
    );

    renderPage();
    const user = userEvent.setup();

    await user.click(
      await screen.findByRole('button', { name: /add employee/i }),
    );

    // Fill the minimum required fields to exercise the POST contract.
    await user.type(screen.getByLabelText(/email/i), 'new.hire@example.com');
    await user.type(screen.getByLabelText(/full name/i), 'New Hire');
    await user.type(screen.getByLabelText(/job title/i), 'Engineer');
    await user.type(screen.getByLabelText(/country/i), 'US');
    await user.type(screen.getByLabelText(/salary/i), '90000.00');
    await user.type(screen.getByLabelText(/hire date/i), '2024-01-15');

    await user.click(
      screen.getByRole('button', { name: /^(save|create|add)$/i }),
    );

    await waitFor(() => {
      expect(posted).not.toBeNull();
      expect(posted).toMatchObject({
        email: 'new.hire@example.com',
        fullName: 'New Hire',
      });
    });
  });

  it('closes the dialog after a successful create', async () => {
    server.use(
      http.get('/api/employees', emptyListResponse),
      http.post('/api/employees', () =>
        HttpResponse.json({ data: sampleEmployee() }, { status: 201 }),
      ),
    );

    renderPage();
    const user = userEvent.setup();

    await user.click(
      await screen.findByRole('button', { name: /add employee/i }),
    );

    await user.type(screen.getByLabelText(/email/i), 'new.hire@example.com');
    await user.type(screen.getByLabelText(/full name/i), 'New Hire');
    await user.type(screen.getByLabelText(/job title/i), 'Engineer');
    await user.type(screen.getByLabelText(/country/i), 'US');
    await user.type(screen.getByLabelText(/salary/i), '90000.00');
    await user.type(screen.getByLabelText(/hire date/i), '2024-01-15');

    await user.click(
      screen.getByRole('button', { name: /^(save|create|add)$/i }),
    );

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });
});

describe('Edit employee dialog', () => {
  it('pre-fills the form with the row data when Edit is clicked', async () => {
    server.use(
      http.get('/api/employees', () =>
        listWith([
          sampleEmployee({
            fullName: 'Priya Ramaswamy',
            email: 'priya@example.com',
          }),
        ]),
      ),
    );

    renderPage();
    const user = userEvent.setup();

    // Wait for the row to render, then click its Edit button.
    await screen.findByText('Priya Ramaswamy');
    await user.click(screen.getByRole('button', { name: /edit/i }));

    const dialog = await screen.findByRole('dialog');
    // The pre-filled values must reflect the row, not defaults.
    expect(dialog).toHaveTextContent('Priya Ramaswamy');
  });

  it('submits the changes via PATCH /api/employees/:id', async () => {
    let patched: { url: string; body: Record<string, unknown> } | null = null;
    server.use(
      http.get('/api/employees', () =>
        listWith([sampleEmployee({ fullName: 'Original Name' })]),
      ),
      http.patch('/api/employees/:id', async ({ request, params }) => {
        patched = {
          url: String(params.id),
          body: (await request.json()) as Record<string, unknown>,
        };
        return HttpResponse.json({ data: sampleEmployee(patched.body) });
      }),
    );

    renderPage();
    const user = userEvent.setup();

    await screen.findByText('Original Name');
    await user.click(screen.getByRole('button', { name: /edit/i }));

    const fullNameInput = await screen.findByLabelText(/full name/i);
    await user.clear(fullNameInput);
    await user.type(fullNameInput, 'New Name');

    await user.click(screen.getByRole('button', { name: /^save$/i }));

    await waitFor(() => {
      expect(patched).not.toBeNull();
      expect(patched?.body).toMatchObject({ fullName: 'New Name' });
    });
  });
});

describe('Delete employee', () => {
  it('shows a confirmation before deleting', async () => {
    server.use(
      http.get('/api/employees', () => listWith([sampleEmployee()])),
    );

    renderPage();
    const user = userEvent.setup();

    await screen.findByText('Priya Ramaswamy');
    await user.click(screen.getByRole('button', { name: /delete/i }));

    // A confirmation must appear before the DELETE request fires. The
    // exact copy is implementation-defined but must mention "delete"
    // or "confirm" so the persona knows what they are agreeing to.
    const dialog = await screen.findByRole('dialog');
    expect(dialog.textContent?.toLowerCase()).toMatch(/delete|confirm/);
  });

  it('calls DELETE /api/employees/:id when the user confirms', async () => {
    let deletedId: string | null = null;
    server.use(
      http.get('/api/employees', () => listWith([sampleEmployee()])),
      http.delete('/api/employees/:id', ({ params }) => {
        deletedId = String(params.id);
        return new HttpResponse(null, { status: 204 });
      }),
    );

    renderPage();
    const user = userEvent.setup();

    await screen.findByText('Priya Ramaswamy');
    await user.click(screen.getByRole('button', { name: /delete/i }));

    // Confirm. The confirmation button is inside the dialog; use a
    // scoped query so we do not click the row's Delete button again.
    const dialog = await screen.findByRole('dialog');
    const confirmButton = await screen.findByRole('button', {
      name: /^(delete|confirm|yes)$/i,
    });
    // The confirm button must be inside the dialog, not the row.
    expect(dialog.contains(confirmButton)).toBe(true);
    await user.click(confirmButton);

    await waitFor(() => {
      expect(deletedId).toBe('clw1234567890abcdefghijkl');
    });
  });
});
