import { z } from 'zod';

export const LifecycleStatus = z.enum(['Active', 'Onboarding', 'Offboarding', 'Exited']);
export type LifecycleStatus = z.infer<typeof LifecycleStatus>;

export const EmployeeSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  personalEmail: z.string().email(),
  workEmail: z.string().email(),
  department: z.string(),
  manager: z.string(),
  joiningDate: z.string(),
  lastWorkingDay: z.string().nullable().optional(),
  status: LifecycleStatus,
});

export type Employee = z.infer<typeof EmployeeSchema>;
