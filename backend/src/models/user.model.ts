import { z } from 'zod';

export const AppRole = z.enum(['user']);
export type AppRole = z.infer<typeof AppRole>;

export const AccountStatus = z.enum(['active', 'deactivated', 'suspended']);
export type AccountStatus = z.infer<typeof AccountStatus>;

export const AppUserSchema = z.object({
  id: z.string().uuid(),
  firebaseUid: z.string(),
  email: z.string().email(),
  displayName: z.string().nullable().optional(),
  photoUrl: z.string().nullable().optional(),
  role: AppRole,
  accountStatus: AccountStatus,
  preferences: z.record(z.unknown()).optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
  lastLoginAt: z.string().nullable().optional(),
});
export type AppUser = z.infer<typeof AppUserSchema>;

// Aliases for compatibility
export const HrRole = AppRole;
export type HrRole = AppRole;
export const HrUserSchema = AppUserSchema;
export type HrUser = AppUser;

export const CreateUserSchema = z.object({
  firebaseUid: z.string().min(1),
  email: z.string().email(),
  displayName: z.string().optional(),
  photoUrl: z.string().optional(),
  role: AppRole.default('user'),
  accountStatus: AccountStatus.default('active'),
  preferences: z.record(z.unknown()).optional(),
});
export type CreateUserInput = z.infer<typeof CreateUserSchema>;

export const UpdateUserProfileSchema = z.object({
  displayName: z.string().trim().min(1, 'Display name cannot be empty').max(255).optional(),
  photoUrl: z
    .string()
    .url('Invalid URL')
    .refine(val => val === '' || val.startsWith('https://') || val.startsWith('http://'), {
      message: 'Photo URL must use http or https scheme',
    })
    .or(z.literal(''))
    .optional(),
  preferences: z.record(z.unknown()).optional(),
});
export type UpdateUserProfileInput = z.infer<typeof UpdateUserProfileSchema>;

export const AdminUpdateUserSchema = z.object({
  role: AppRole.optional(),
  accountStatus: AccountStatus.optional(),
  displayName: z.string().trim().min(1).optional(),
});
export type AdminUpdateUserInput = z.infer<typeof AdminUpdateUserSchema>;

// Legacy schema aliases for existing admin controllers if referenced
export const CreateHrUserSchema = CreateUserSchema;
export type CreateHrUserInput = CreateUserInput;
export const UpdateHrUserSchema = AdminUpdateUserSchema;
export type UpdateHrUserInput = AdminUpdateUserInput;
