import { z } from 'zod';

export const HrRole = z.enum(['hr_admin', 'hr_staff']);
export type HrRole = z.infer<typeof HrRole>;

export const HrUserSchema = z.object({
  hrUserId: z.number(),
  firebaseUid: z.string(),
  email: z.string().email(),
  fullName: z.string().min(1),
  role: HrRole,
  isActive: z.boolean(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});
export type HrUser = z.infer<typeof HrUserSchema>;

export const CreateHrUserSchema = z.object({
  email: z.string().email(),
  fullName: z.string().min(1, 'Full name is required'),
  role: HrRole.default('hr_staff'),
  firebaseUid: z.string().optional(),
});
export type CreateHrUserInput = z.infer<typeof CreateHrUserSchema>;

export const UpdateHrUserSchema = z.object({
  fullName: z.string().min(1).optional(),
  role: HrRole.optional(),
  isActive: z.boolean().optional(),
});
export type UpdateHrUserInput = z.infer<typeof UpdateHrUserSchema>;
