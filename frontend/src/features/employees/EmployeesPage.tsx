import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { useState } from 'react';

import { listEmployees, type EmployeesListParams } from './api';

// The "doing" surface from docs/02-product-thinking.md §5: a searchable,
// paginated table of every employee in the org. CRUD dialogs and richer
// filters land in subsequent commits; this commit establishes the
// table + search + pagination scaffold the rest builds on.

const PAGE_SIZE = 50;

export const EmployeesPage = () => {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');

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
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {data.data.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
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
    </section>
  );
};
