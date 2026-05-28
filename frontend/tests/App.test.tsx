import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClientProvider, QueryClient } from '@tanstack/react-query';

import { App } from '../src/App';

// Smoke test for the app shell. Mirrors the role of the backend health smoke
// test (tests/integration/health.test.ts): two purposes - prove that the
// Vitest + RTL + jsdom + react-router-dom stack works end-to-end before any
// feature lands on top, and pin down the shell behaviour every future test
// will compose against.

const renderApp = (initialEntries = ['/']) =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={initialEntries}>
        <App />
      </MemoryRouter>
    </QueryClientProvider>,
  );

describe('App shell', () => {
  it('renders both top-level navigation links', () => {
    renderApp();
    expect(screen.getByRole('link', { name: /employees/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /insights/i })).toBeInTheDocument();
  });

  it('redirects the root path to /employees', () => {
    renderApp(['/']);
    expect(
      screen.getByRole('heading', { level: 2, name: /employees/i }),
    ).toBeInTheDocument();
  });

  it('renders the Insights page at /insights', () => {
    renderApp(['/insights']);
    expect(
      screen.getByRole('heading', { level: 2, name: /insights/i }),
    ).toBeInTheDocument();
  });

  it('redirects unknown paths back to /employees', () => {
    renderApp(['/some/unknown/path']);
    expect(
      screen.getByRole('heading', { level: 2, name: /employees/i }),
    ).toBeInTheDocument();
  });
});
