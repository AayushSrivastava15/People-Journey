import { z } from 'zod';

export type DraftStatus = 'prepared' | 'gmail_opened' | 'sent_unconfirmed' | 'cancelled';

export interface EmailDraft {
  id: string;
  ownerUserId: string;
  employeeId: number | null;
  templateId: string | null;
  lifecycleEvent: string;
  recipientEmail: string;
  recipientName: string | null;
  subjectSnapshot: string;
  bodySnapshot: string;
  status: DraftStatus;
  preparedAt: string;
  gmailOpenedAt: string | null;
  createdAt: string;
  updatedAt: string;
  employeeCode?: string;
  departmentName?: string;
  templateName?: string;
}

export const previewDraftSchema = z.object({
  employeeId: z.number().int().positive().optional().nullable(),
  templateId: z.string().uuid().optional().nullable(),
  candidateName: z.string().trim().max(255).optional().nullable(),
  candidateEmail: z.union([z.string().trim().email(), z.literal('')]).optional().nullable(),
  subjectOverride: z.string().trim().optional(),
  bodyOverride: z.string().trim().optional(),
  customPlaceholders: z.record(z.string()).optional(),
  customValues: z.record(z.string()).optional(),
});

export const createDraftSchema = z.object({
  employeeId: z.number().int().positive().optional().nullable(),
  templateId: z.string().uuid().optional().nullable(),
  lifecycleEvent: z.string().trim().min(1, 'Lifecycle event is required').max(100),
  recipientEmail: z.string().trim().email('Valid recipient email is required'),
  recipientName: z.string().trim().max(255).optional().nullable(),
  subjectSnapshot: z.string().trim().min(1, 'Subject snapshot is required').max(500),
  bodySnapshot: z.string().trim().min(1, 'Body snapshot is required'),
  status: z.enum(['prepared', 'gmail_opened', 'sent_unconfirmed', 'cancelled']).default('prepared'),
});

export const updateDraftStatusSchema = z.object({
  status: z.enum(['prepared', 'gmail_opened', 'sent_unconfirmed', 'cancelled']),
  gmailOpened: z.boolean().optional(),
});

export type PreviewDraftDto = z.infer<typeof previewDraftSchema>;
export type CreateDraftDto = z.infer<typeof createDraftSchema>;
export type UpdateDraftStatusDto = z.infer<typeof updateDraftStatusSchema>;
