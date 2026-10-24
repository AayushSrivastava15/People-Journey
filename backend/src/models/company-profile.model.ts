import { z } from 'zod';

export interface CompanyProfile {
  id: string;
  ownerUserId: string;
  companyName: string;
  hrContactName: string | null;
  hrContactEmail: string | null;
  companyAddress: string | null;
  officeLocation: string | null;
  hrContactPhone: string | null;
  defaultSenderName: string | null;
  defaultEmailSignature: string | null;
  companyWebsite: string | null;
  departmentTeam: string | null;
  createdAt: string;
  updatedAt: string;
}

export const upsertCompanyProfileSchema = z.object({
  companyName: z.string().trim().min(1, 'Company name is required').max(255),
  hrContactName: z.string().trim().max(255).optional().nullable(),
  hrContactEmail: z.union([z.string().trim().email('Invalid HR contact email format'), z.literal('')]).optional().nullable(),
  companyAddress: z.string().trim().max(1000).optional().nullable(),
  officeLocation: z.string().trim().max(255).optional().nullable(),
  hrContactPhone: z.string().trim().max(50).optional().nullable(),
  defaultSenderName: z.string().trim().max(255).optional().nullable(),
  defaultEmailSignature: z.string().trim().max(2000).optional().nullable(),
  companyWebsite: z.string().trim().max(255).optional().nullable(),
  departmentTeam: z.string().trim().max(100).optional().nullable(),
});

export type UpsertCompanyProfileDto = z.infer<typeof upsertCompanyProfileSchema>;
