import { QueryClient } from '@tanstack/react-query';

// Tuned per docs/07-performance-plan.md §4:
//   - Insights data does not change second-to-second; a 30s staleTime is
//     more than fine and avoids refetching the same numbers on every nav.
//   - Write mutations explicitly invalidate the queries they affect; we do
//     not poll, and we do not refetch on window focus (it surprises users
//     who alt-tab away to copy a number for a slide).

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});
