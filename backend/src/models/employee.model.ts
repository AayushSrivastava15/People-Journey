import { z } from 'zod';

export const EmploymentStatusEnum = z.enum(['ONBOARDING', 'ACTIVE', 'OFFBOARDING', 'EXITED']);
export type EmploymentStatus = z.infer<typeof EmploymentStatusEnum>;

export const EmployeeSchema = z.object({
  employeeId: z.number(),
  employeeCode: z.string(),
  firstName: z.string(),
  lastName: z.string().nullable().optional(),
  name: z.string(), // Combined display name
  workEmail: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  departmentId: z.number().nullable().optional(),
  designationId: z.number().nullable().optional(),
  departmentName: z.string().nullable().optional(),
  designationName: z.string().nullable().optional(),
  employmentStatus: EmploymentStatusEnum,
  status: z.enum(['Active', 'Onboarding', 'Offboarding', 'Exited']), // Frontend casing helper
  hireDate: z.string(),
  exitDate: z.string().nullable().optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
  createdBy: z.string().nullable().optional(),
  ownerUserId: z.string().uuid().optional(),
});
export type Employee = z.infer<typeof EmployeeSchema>;

export const CreateEmployeeSchema = z.object({
  employeeCode: z.string().trim().max(30).optional(),
  firstName: z.string().trim().min(1, 'First name is required').max(100),
  lastName: z.string().trim().max(100).optional().default(''),
  fullName: z.string().trim().optional(), // Helper for forms passing single name field
  workEmail: z.string().trim().email('Invalid email address').optional().or(z.literal('')),
  personalEmail: z.string().trim().email().optional().or(z.literal('')),
  phone: z.string().trim().max(30).optional().default(''),
  departmentId: z.coerce.number().positive().optional(),
  department: z.string().trim().optional(), // Helper for forms passing department name
  designationId: z.coerce.number().positive().optional(),
  designation: z.string().trim().optional(),
  manager: z.string().trim().optional(),
  employmentStatus: z.enum(['ONBOARDING', 'ACTIVE', 'OFFBOARDING', 'EXITED', 'Onboarding', 'Active', 'Offboarding', 'Exited'])
    .optional()
    .default('ONBOARDING'),
  hireDate: z.string().min(1, 'Joining/Hire date is required'),
  joiningDate: z.string().optional(), // Helper alias
  exitDate: z.string().optional().nullable(),
  lastWorkingDay: z.string().optional().nullable(), // Helper alias
});
export type CreateEmployeeInput = z.input<typeof CreateEmployeeSchema>;


export const UpdateEmployeeSchema = z.object({
  firstName: z.string().trim().min(1).max(100).optional(),
  lastName: z.string().trim().max(100).optional(),
  workEmail: z.string().trim().email().optional().or(z.literal('')),
  phone: z.string().trim().max(30).optional(),
  departmentId: z.coerce.number().positive().optional().nullable(),
  designationId: z.coerce.number().positive().optional().nullable(),
  employmentStatus: z.enum(['ONBOARDING', 'ACTIVE', 'OFFBOARDING', 'EXITED', 'Onboarding', 'Active', 'Offboarding', 'Exited']).optional(),
  hireDate: z.string().optional(),
  exitDate: z.string().optional().nullable(),
});
export type UpdateEmployeeInput = z.infer<typeof UpdateEmployeeSchema>;

export const OffboardEmployeeSchema = z.object({
  plannedExitDate: z.string().min(1, 'Planned exit date is required'),
  lastWorkingDay: z.string().optional(), // Helper alias
  noticeDate: z.string().optional(),
  exitReason: z.string().trim().max(500).optional(),
  notes: z.string().trim().max(2000).optional(),
  contactEmail: z.string().trim().email().optional().or(z.literal('')),
});
export type OffboardEmployeeInput = z.infer<typeof OffboardEmployeeSchema>;

export const EmployeeQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
  search: z.string().trim().optional(),
  status: z.string().trim().optional(),
  departmentId: z.coerce.number().int().positive().optional(),
  designationId: z.coerce.number().int().positive().optional(),
  sortBy: z.enum(['CREATED_AT', 'FIRST_NAME', 'HIRE_DATE', 'EMPLOYEE_CODE']).default('CREATED_AT'),
  sortOrder: z.enum(['ASC', 'DESC', 'asc', 'desc']).default('DESC'),
});
export type EmployeeQueryParams = z.infer<typeof EmployeeQuerySchema>;
