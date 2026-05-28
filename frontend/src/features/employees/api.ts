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

// Mutation client functions. Each returns the wrapped response shape from
// the backend (or void for DELETE) so the calling useMutation can stay
// strongly typed all the way through.

export type CreateEmployeeBody = {
  email: string;
  fullName: string;
  jobTitle: string;
  country: string;
  department: string;
  salary: string;
  employmentType?: string;
  hireDate: string;
};

export type UpdateEmployeeBody = Partial<CreateEmployeeBody>;

export const createEmployee = (
  body: CreateEmployeeBody,
): Promise<{ data: Employee }> => {
  return apiRequest<{ data: Employee }>('/api/employees', {
    method: 'POST',
    body,
  });
};

export const updateEmployee = (
  id: string,
  body: UpdateEmployeeBody,
): Promise<{ data: Employee }> => {
  return apiRequest<{ data: Employee }>(`/api/employees/${id}`, {
    method: 'PATCH',
    body,
  });
};

export const deleteEmployee = (id: string): Promise<void> => {
  return apiRequest<void>(`/api/employees/${id}`, { method: 'DELETE' });
};
