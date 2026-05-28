import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// React Testing Library mounts components into a shared jsdom document; cleanup
// after each test prevents leakage between tests (a Test A render becoming
// visible to Test B's queries). Importing jest-dom/vitest registers the
// .toBeInTheDocument(), .toHaveTextContent(), etc. matchers globally.

afterEach(() => {
  cleanup();
});
