import { z } from 'zod';

export const createExitInterviewSchema = z.object({
  employeeId: z.coerce.number().int().positive(),
  offboardingId: z.coerce.number().int().positive().optional(),
  templateId: z.string().uuid(),
  expiryDays: z.coerce.number().int().min(1).max(90).default(14),
  responseDueDate: z.string().nullable().optional(),
}).strict();

export const regenerateExitInterviewSchema = z.object({
  expiryDays: z.coerce.number().int().min(1).max(90).default(14),
}).strict();

export const googleFormsWebhookSchema = z.object({
  responseId: z.string().min(1).max(255).optional(),
  timestamp: z.string().optional(),
  invitationReference: z.string().optional(),
  employeeId: z.string().optional(),
  employeeName: z.string().optional(),
  answers: z.record(z.unknown()).default({}),
});

export const listExitInterviewsSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  employeeId: z.coerce.number().int().positive().optional(),
  status: z.enum(['PENDING', 'OPENED', 'COMPLETED', 'REVOKED', 'EXPIRED']).optional(),
  departmentId: z.coerce.number().int().positive().optional(),
  from: z.string().date().optional(),
  to: z.string().date().optional(),
}).strict();

export const submitExitInterviewSchema = z.object({ answers: z.record(z.unknown()) }).strict();
export const reopenExitInterviewSchema = z.object({ confirm: z.literal(true), expiryDays: z.coerce.number().int().min(1).max(90).default(14) }).strict();

export const evaluationSchema = z.object({
  interviewerName: z.string().trim().max(255).nullable().optional(),
  interviewDate: z.string().datetime().nullable().optional(),
  interviewMode: z.enum(['in_person', 'video', 'phone', 'other']).nullable().optional(),
  reasonCategory: z.string().trim().max(100).nullable().optional(),
  regrettableExit: z.boolean().nullable().optional(),
  rehireEligibility: z.enum(['eligible', 'not_eligible', 'conditional', 'undetermined']).nullable().optional(),
  hrObservations: z.string().max(10000).nullable().optional(),
  actionItems: z.array(z.string().trim().min(1).max(1000)).max(100).optional(),
  hrSignature: z.string().max(2000).nullable().optional(),
}).strict();
