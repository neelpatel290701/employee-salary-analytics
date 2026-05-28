import { Link, Navigate, Route, Routes } from 'react-router-dom';

import { EmployeesPage } from './features/employees/EmployeesPage';
import { InsightsPage } from './features/insights/InsightsPage';

// Two-tab layout per docs/02-product-thinking.md §5 - the "doing" surface
// (Employees) and the "thinking" surface (Insights). No nested menus, no
// deep navigation. The HR Manager should never wonder where a feature lives.

export const App = () => (
  <div className="min-h-screen bg-slate-50 text-slate-900">
    <header className="border-b border-slate-200 bg-white">
      <nav className="mx-auto flex max-w-6xl items-center gap-6 px-6 py-4">
        <h1 className="text-lg font-semibold">Salary Analytics</h1>
        <div className="flex gap-4 text-sm">
          <Link to="/employees" className="text-slate-700 hover:underline">
            Employees
          </Link>
          <Link to="/insights" className="text-slate-700 hover:underline">
            Insights
          </Link>
        </div>
      </nav>
    </header>

    <main className="mx-auto max-w-6xl px-6 py-8">
      <Routes>
        <Route path="/" element={<Navigate to="/employees" replace />} />
        <Route path="/employees" element={<EmployeesPage />} />
        <Route path="/insights" element={<InsightsPage />} />
        <Route path="*" element={<Navigate to="/employees" replace />} />
      </Routes>
    </main>
  </div>
);
