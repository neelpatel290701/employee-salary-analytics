import type { Employee } from '@app/shared';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { useState } from 'react';

import { listEmployees, type EmployeesListParams } from './api';
import { DeleteConfirmDialog } from './DeleteConfirmDialog';
import { EmployeeFormDialog } from './EmployeeFormDialog';

// The "doing" surface from docs/02-product-thinking.md §5: a searchable,
// paginated table of every employee in the org. CRUD dialogs and richer
// filters land in subsequent commits; this commit establishes the
// table + search + pagination scaffold the rest builds on.

const PAGE_SIZE = 50;

export const EmployeesPage = () => {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  // Dialog state. createOpen is a boolean (no row context); the edit
  // and delete dialogs carry the targeted row through their own
  // employee-or-null state so we know which record to mutate.
  const [createOpen, setCreateOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [deletingEmployee, setDeletingEmployee] = useState<Employee | null>(
    null,
  );

  // Build the query params. Empty strings are stripped by toQueryString
  // so the URL only carries parameters the user actually set.
  const params: EmployeesListParams = {
    page,
    pageSize: PAGE_SIZE,
    ...(search ? { search } : {}),
  };

  const { data, isLoading, isError } = useQuery({
    queryKey: ['employees', params],
    queryFn: () => listEmployees(params),
    // Keep the previous page visible while the next page loads - no
    // flicker between pagination clicks (TanStack Query v5 idiom).
    placeholderData: keepPreviousData,
  });

  const totalPages = data?.pagination.totalPages ?? 1;
  const total = data?.pagination.total ?? 0;
  const rangeStart = (page - 1) * PAGE_SIZE + 1;
  const rangeEnd = Math.min(page * PAGE_SIZE, total);

  return (
    <section>
      <header className="mb-4 flex items-center justify-between gap-4">
        <h2 className="text-xl font-semibold">Employees</h2>
        <div className="flex items-center gap-2">
          <input
            type="search"
            placeholder="Search by name or email..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1); // reset to first page on new search
            }}
            className="w-72 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
          />
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800"
          >
            Add Employee
          </button>
        </div>
      </header>

      {isError && (
        <p className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          Failed to load employees. Please refresh the page.
        </p>
      )}

      {data && (
        <div className="overflow-hidden rounded-md border border-slate-200 bg-white">
          {/* Headers always render so the table structure is visible even
              when there are no matching rows - keeps the empty state
              honest about what the table contains. */}
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-left">
              <tr>
                <th scope="col" className="px-4 py-2 font-medium">
                  Name
                </th>
                <th scope="col" className="px-4 py-2 font-medium">
                  Job Title
                </th>
                <th scope="col" className="px-4 py-2 font-medium">
                  Country
                </th>
                <th scope="col" className="px-4 py-2 font-medium">
                  Department
                </th>
                <th scope="col" className="px-4 py-2 font-medium text-right">
                  Salary
                </th>
                <th scope="col" className="px-4 py-2 font-medium">
                  Hire Date
                </th>
                <th scope="col" className="px-4 py-2 font-medium text-right">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {data.data.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    className="px-4 py-12 text-center text-sm text-slate-500"
                  >
                    {search
                      ? `No employees match "${search}".`
                      : 'No employees in the database yet. Run the seed script or add an employee to get started.'}
                  </td>
                </tr>
              ) : (
                data.data.map((emp) => (
                  <tr key={emp.id} className="hover:bg-slate-50">
                    <td className="px-4 py-2">{emp.fullName}</td>
                    <td className="px-4 py-2">{emp.jobTitle}</td>
                    <td className="px-4 py-2">{emp.country}</td>
                    <td className="px-4 py-2 text-slate-600">
                      {emp.department}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      ${Number(emp.salary).toLocaleString('en-US', {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </td>
                    <td className="px-4 py-2 text-slate-600">{emp.hireDate}</td>
                    <td className="px-4 py-2 text-right">
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          aria-label={`Edit employee ${emp.fullName}`}
                          onClick={() => setEditingEmployee(emp)}
                          className="rounded border border-slate-300 bg-white px-2 py-1 text-xs hover:bg-slate-50"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          aria-label={`Delete employee ${emp.fullName}`}
                          onClick={() => setDeletingEmployee(emp)}
                          className="rounded border border-red-300 bg-white px-2 py-1 text-xs text-red-700 hover:bg-red-50"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {data && (
        <div className="mt-4 flex items-center justify-between text-sm text-slate-600">
          {/* "no silent truncation" - design principle 5 - the total is
              always visible even when only one page is shown. */}
          <p>
            {total === 0
              ? '0 employees'
              : `Showing ${rangeStart}–${rangeEnd} of ${total}`}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1 || isLoading}
              className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Previous
            </button>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages || isLoading}
              className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      )}

      <EmployeeFormDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
      />
      <EmployeeFormDialog
        open={editingEmployee !== null}
        onClose={() => setEditingEmployee(null)}
        employee={editingEmployee}
      />
      <DeleteConfirmDialog
        open={deletingEmployee !== null}
        onClose={() => setDeletingEmployee(null)}
        employee={deletingEmployee}
      />
    </section>
  );
};
