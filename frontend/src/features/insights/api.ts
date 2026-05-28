import type {
  CountryStats,
  InsightsSummary,
  Outlier,
} from '@app/shared';

import { apiRequest } from '@/lib/api';

// Typed API client for the Insights endpoints. Each function returns the
// wrapped response shape ({ data: ... }) the backend sends, so consumers
// destructure once and TanStack Query caches the inner value.

export const fetchSummary = (): Promise<{ data: InsightsSummary }> =>
  apiRequest<{ data: InsightsSummary }>('/api/insights/summary');

export const fetchCountryStats = (): Promise<{ data: CountryStats[] }> =>
  apiRequest<{ data: CountryStats[] }>('/api/insights/country-stats');

export const fetchOutliers = (): Promise<{ data: Outlier[] }> =>
  apiRequest<{ data: Outlier[] }>('/api/insights/outliers');
