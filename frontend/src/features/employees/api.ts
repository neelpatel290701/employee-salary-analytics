import type { Employee } from '@app/shared';

import { apiRequest } from '@/lib/api';

// Typed API client for the Employee aggregate. Each function consumes
// the same response shape the backend serialises (Employee from
// @app/shared), so a contract change ripples through here at compile
// time.

export type EmployeesListResponse = {
  data: Employee[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
};

export type EmployeesListParams = {
  page?: number;
  pageSize?: number;
  search?: string;
  country?: string;
  jobTitle?: string;
  department?: string;
  employmentType?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
};

const toQueryString = (params: EmployeesListParams): string => {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === '' || value === null) continue;
    query.set(key, String(value));
  }
  const qs = query.toString();
  return qs ? `?${qs}` : '';
};

export const listEmployees = (
  params: EmployeesListParams = {},
): Promise<EmployeesListResponse> => {
  return apiRequest<EmployeesListResponse>(
    `/api/employees${toQueryString(params)}`,
  );
};
