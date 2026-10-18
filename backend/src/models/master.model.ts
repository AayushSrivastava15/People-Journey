import { z } from 'zod';

export const DepartmentSchema = z.object({
  departmentId: z.number(),
  departmentName: z.string().min(1),
  description: z.string().nullable().optional(),
  isActive: z.boolean(),
  employeeCount: z.number().optional(),
  createdAt: z.string().optional(),
});
export type Department = z.infer<typeof DepartmentSchema>;

export const CreateDepartmentSchema = z.object({
  departmentName: z.string().trim().min(1, 'Department name is required').max(100),
  description: z.string().trim().max(500).optional(),
});
export type CreateDepartmentInput = z.infer<typeof CreateDepartmentSchema>;

export const DesignationSchema = z.object({
  designationId: z.number(),
  designationName: z.string().min(1),
  description: z.string().nullable().optional(),
  createdAt: z.string().optional(),
});
export type Designation = z.infer<typeof DesignationSchema>;

export const CreateDesignationSchema = z.object({
  designationName: z.string().trim().min(1, 'Designation name is required').max(100),
  description: z.string().trim().max(500).optional(),
});
export type CreateDesignationInput = z.infer<typeof CreateDesignationSchema>;
