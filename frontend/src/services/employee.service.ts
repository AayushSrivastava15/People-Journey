import { apiClient } from '../api/client';
import type { Employee } from '../types';

export const employeeService = {
  async getAll(): Promise<Employee[]> {
    return apiClient<Employee[]>('/employees');
  },

  async getById(id: string): Promise<Employee> {
    return apiClient<Employee>(`/employees/${id}`);
  },

  async create(employee: Omit<Employee, 'id'>): Promise<Employee> {
    return apiClient<Employee>('/employees', {
      method: 'POST',
      body: JSON.stringify(employee),
    });
  },
};
