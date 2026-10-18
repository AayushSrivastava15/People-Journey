import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from './client';
import type {
  Employee,
  PaginatedResponse,
  Department,
  Designation,
  DashboardStats,
  CreateEmployeePayload,
  OffboardEmployeePayload,
} from '../types/api';

export const QUERY_KEYS = {
  dashboardStats: ['dashboard', 'stats'] as const,
  employees: (params?: Record<string, unknown>) => ['employees', params || {}] as const,
  departments: ['departments'] as const,
  designations: ['designations'] as const,
};

export function useDashboardStats() {
  return useQuery({
    queryKey: QUERY_KEYS.dashboardStats,
    queryFn: () => apiClient<DashboardStats>('/dashboard/stats'),
    staleTime: 30000,
  });
}

export function useEmployees(params: {
  page?: number;
  limit?: number;
  search?: string;
  status?: string;
  departmentId?: number;
}) {
  const queryParams = new URLSearchParams();
  if (params.page) queryParams.set('page', String(params.page));
  if (params.limit) queryParams.set('limit', String(params.limit));
  if (params.search) queryParams.set('search', params.search);
  if (params.status && params.status !== 'All' && params.status !== 'All statuses') {
    queryParams.set('status', params.status);
  }
  if (params.departmentId) queryParams.set('departmentId', String(params.departmentId));

  const queryString = queryParams.toString();
  const endpoint = queryString ? `/employees?${queryString}` : '/employees';

  return useQuery({
    queryKey: QUERY_KEYS.employees(params),
    queryFn: () => apiClient<PaginatedResponse<Employee>>(endpoint),
    staleTime: 15000,
  });
}

export function useDepartments() {
  return useQuery({
    queryKey: QUERY_KEYS.departments,
    queryFn: () => apiClient<Department[]>('/departments'),
    staleTime: 60000,
  });
}

export function useDesignations() {
  return useQuery({
    queryKey: QUERY_KEYS.designations,
    queryFn: () => apiClient<Designation[]>('/designations'),
    staleTime: 60000,
  });
}

export function useCreateEmployee() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: CreateEmployeePayload) =>
      apiClient<Employee>('/employees', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employees'] });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.dashboardStats });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.departments });
    },
  });
}

export function useOffboardEmployee() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      employeeId,
      payload,
    }: {
      employeeId: number | string;
      payload: OffboardEmployeePayload;
    }) =>
      apiClient<{ employee: Employee; offboardingId: number }>(`/employees/${employeeId}/offboard`, {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employees'] });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.dashboardStats });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.departments });
    },
  });
}
