import { z } from 'zod';

export interface CompanyProfile {
  id: string;
  ownerUserId: string;
  companyName: string;
  displayName: string | null;
  logoUrl: string | null;
  brandPrimaryColor: string | null;
  industry: string | null;
  companyWebsite: string | null;
  companyAddress: string | null;
  officeLocation: string | null;
  companyEmail: string | null;
  companyPhone: string | null;
  country: string | null;
  timezone: string | null;
  hrContactName: string | null;
  hrContactEmail: string | null;
  hrContactPhone: string | null;
  departmentTeam: string | null;
  defaultSenderName: string | null;
  defaultEmailSignature: string | null;
  setupCompleted: boolean;
  setupStep: number;
  createdAt: string;
  updatedAt: string;
}

export interface CompanyOnboardingStatus {
  setupCompleted: boolean;
  setupStep: number;
  stepsCompleted: number;
  totalSteps: number;
  steps: {
    details: boolean;
    branding: boolean;
    hrContact: boolean;
    exitForm: boolean;
  };
  hasDefaultTemplate: boolean;
}

export const upsertCompanyProfileSchema = z.object({
  companyName: z.string().trim().min(1, 'Company name is required').max(255),
  displayName: z.string().trim().max(255).optional().nullable(),
  logoUrl: z.string().trim().max(1000).optional().nullable(),
  brandPrimaryColor: z
    .string()
    .trim()
    .regex(/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/, 'Must be a valid hex color code (e.g. #59424f)')
    .optional()
    .nullable(),
  industry: z.string().trim().max(100).optional().nullable(),
  companyWebsite: z.string().trim().max(255).optional().nullable(),
  companyAddress: z.string().trim().max(1000).optional().nullable(),
  officeLocation: z.string().trim().max(255).optional().nullable(),
  companyEmail: z.union([z.string().trim().email('Invalid company email format'), z.literal('')]).optional().nullable(),
  companyPhone: z.string().trim().max(50).optional().nullable(),
  country: z.string().trim().max(100).optional().nullable(),
  timezone: z.string().trim().max(100).optional().nullable(),
  hrContactName: z.string().trim().max(255).optional().nullable(),
  hrContactEmail: z.union([z.string().trim().email('Invalid HR contact email format'), z.literal('')]).optional().nullable(),
  hrContactPhone: z.string().trim().max(50).optional().nullable(),
  departmentTeam: z.string().trim().max(100).optional().nullable(),
  defaultSenderName: z.string().trim().max(255).optional().nullable(),
  defaultEmailSignature: z.string().trim().max(2000).optional().nullable(),
  setupCompleted: z.boolean().optional(),
  setupStep: z.number().int().min(1).max(4).optional(),
});

export type UpsertCompanyProfileDto = z.infer<typeof upsertCompanyProfileSchema>;
