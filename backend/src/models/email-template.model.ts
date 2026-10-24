import { z } from 'zod';

export type TemplateCategory =
  | 'recruitment'
  | 'preboarding'
  | 'onboarding'
  | 'general'
  | 'offboarding'
  | 'exit_interview'
  | 'lifecycle';

export interface EmailTemplate {
  id: string;
  ownerUserId: string | null;
  name: string;
  category: TemplateCategory;
  description: string | null;
  subjectTemplate: string;
  bodyTemplate: string;
  isActive: boolean;
  isSystemTemplate: boolean;
  createdAt: string;
  updatedAt: string;
}

export const createEmailTemplateSchema = z.object({
  name: z.string().trim().min(1, 'Template name is required').max(255),
  category: z.enum([
    'recruitment',
    'preboarding',
    'onboarding',
    'general',
    'offboarding',
    'exit_interview',
    'lifecycle',
  ]),
  description: z.string().trim().max(1000).optional().nullable(),
  subjectTemplate: z.string().trim().min(1, 'Subject template is required').max(500),
  bodyTemplate: z.string().trim().min(1, 'Body template is required'),
  isActive: z.boolean().default(true),
});

export const updateEmailTemplateSchema = z.object({
  name: z.string().trim().min(1).max(255).optional(),
  category: z.enum([
    'recruitment',
    'preboarding',
    'onboarding',
    'general',
    'offboarding',
    'exit_interview',
    'lifecycle',
  ]).optional(),
  description: z.string().trim().max(1000).optional().nullable(),
  subjectTemplate: z.string().trim().min(1).max(500).optional(),
  bodyTemplate: z.string().trim().min(1).optional(),
  isActive: z.boolean().optional(),
});

export type CreateEmailTemplateDto = z.infer<typeof createEmailTemplateSchema>;
export type UpdateEmailTemplateDto = z.infer<typeof updateEmailTemplateSchema>;
