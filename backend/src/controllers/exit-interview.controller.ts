import type { Request, Response } from 'express';
import { z } from 'zod';
import {
  createExitInterviewSchema,
  evaluationSchema,
  listExitInterviewsSchema,
  publishTemplateSchema,
  publicSubmitExitInterviewSchema,
  regenerateExitInterviewSchema,
  reopenExitInterviewSchema,
  submitExitInterviewSchema,
  updateTemplateDraftSchema,
} from '../models/exit-interview.model.js';
import { exitInterviewService } from '../services/exit-interview.service.js';
import { generateResponsesCsv, generateResponsesExcel } from '../utils/exit-interview-export.js';
import { logger } from '../utils/logger.js';

const uuid = z.string().uuid();

const owner = (req: Request, res: Response): string | null => {
  const id = req.user?.id;
  if (!id) {
    res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required.' } });
    return null;
  }
  return id;
};

const validation = (res: Response, message = 'Invalid payload.') =>
  res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message } });

const notFound = (res: Response) =>
  res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Resource not found.' } });

const paramId = (req: Request) => String(req.params.id || '');

const publicHeaders = (res: Response) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
};

// ---------------------------------------------------------------------------
// TEMPLATE MANAGEMENT CONTROLLERS
// ---------------------------------------------------------------------------

export const getCompanyTemplate = async (req: Request, res: Response) => {
  const id = owner(req, res);
  if (!id) return;
  try {
    const data = await exitInterviewService.getOrCreateCompanyTemplate(id);
    res.json({ success: true, data });
  } catch (error) {
    logger.error({ message: (error as Error).message }, 'Failed to load company exit template');
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: 'Could not load company template.' } });
  }
};

export const updateTemplateDraft = async (req: Request, res: Response) => {
  const id = owner(req, res);
  if (!id) return;
  const p = updateTemplateDraftSchema.safeParse(req.body);
  if (!p.success) return validation(res, 'Invalid template schema structure.');
  try {
    const data = await exitInterviewService.updateTemplateDraft(id, p.data as any);
    res.json({ success: true, message: 'Template draft saved successfully.', data });
  } catch (error) {
    logger.error({ message: (error as Error).message }, 'Failed to save template draft');
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: 'Could not save template draft.' } });
  }
};

export const publishTemplate = async (req: Request, res: Response) => {
  const id = owner(req, res);
  if (!id) return;
  const p = publishTemplateSchema.safeParse(req.body);
  try {
    const data = await exitInterviewService.publishTemplate(id, p.success ? p.data.changeSummary : null);
    res.json({ success: true, message: 'New template version published successfully.', data });
  } catch (error) {
    logger.error({ message: (error as Error).message }, 'Failed to publish template version');
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: 'Could not publish template version.' } });
  }
};

export const resetTemplateToDefault = async (req: Request, res: Response) => {
  const id = owner(req, res);
  if (!id) return;
  try {
    const data = await exitInterviewService.resetTemplateToDefault(id);
    res.json({ success: true, message: 'Template successfully reset to master questionnaire.', data });
  } catch (error) {
    logger.error({ message: (error as Error).message }, 'Failed to reset template');
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: 'Could not reset template.' } });
  }
};

export const listTemplates = async (req: Request, res: Response) => {
  const id = owner(req, res);
  if (!id) return;
  try {
    res.json({ success: true, data: await exitInterviewService.listTemplates(id) });
  } catch (error) {
    logger.error({ message: (error as Error).message }, 'Failed to load exit interview templates');
    res.status(500).json({ success: false, error: { code: 'INTERNAL_SERVER_ERROR', message: 'Could not load templates.' } });
  }
};

// ---------------------------------------------------------------------------
// INVITATION MANAGEMENT CONTROLLERS
// ---------------------------------------------------------------------------

export const listInterviews = async (req: Request, res: Response) => {
  const id = owner(req, res);
  if (!id) return;
  const p = listExitInterviewsSchema.safeParse(req.query);
  if (!p.success) return validation(res, 'Invalid filters.');
  try {
    res.json({ success: true, ...(await exitInterviewService.list(id, p.data)) });
  } catch {
    res.status(500).json({ success: false, error: { code: 'INTERNAL_SERVER_ERROR', message: 'Could not load interviews.' } });
  }
};

export const createInterview = async (req: Request, res: Response) => {
  const id = owner(req, res);
  if (!id) return;
  const p = createExitInterviewSchema.safeParse(req.body);
  if (!p.success) return validation(res);
  try {
    const data = await exitInterviewService.create(id, p.data);
    res.status(201).json({ success: true, data });
  } catch (e) {
    const m = (e as Error).message;
    const map: Record<string, [number, string, string]> = {
      EMPLOYEE_NOT_FOUND: [404, 'NOT_FOUND', 'Employee not found.'],
      OFFBOARDING_NOT_FOUND: [404, 'NOT_FOUND', 'Offboarding record not found.'],
      TEMPLATE_NOT_FOUND: [404, 'NOT_FOUND', 'Template not found.'],
      ACTIVE_INTERVIEW_EXISTS: [409, 'CONFLICT', 'An active exit interview invitation already exists for this employee.'],
    };
    if (map[m]) {
      const [status, code, message] = map[m];
      logger.warn({ employeeId: p.data.employeeId, code, message }, 'Exit interview invitation creation prevented');
      res.status(status).json({ success: false, error: { code, message } });
      return;
    }
    logger.error({ error: (e as Error).message, stack: (e as Error).stack }, 'Could not create exit interview');
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: 'Could not create interview.' } });
  }
};

export const regenerateInterview = async (req: Request, res: Response) => {
  const id = owner(req, res);
  if (!id) return;
  const interviewId = paramId(req);
  if (!uuid.safeParse(interviewId).success) return validation(res, 'Invalid interview ID.');
  const p = regenerateExitInterviewSchema.safeParse(req.body);
  const expiryDays = p.success ? p.data.expiryDays : 14;

  try {
    const data = await exitInterviewService.regenerate(id, interviewId, id, expiryDays);
    if (!data) return notFound(res);
    res.json({ success: true, data });
  } catch (err) {
    logger.error({ message: (err as Error).message }, 'Failed to regenerate exit interview link');
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: 'Could not regenerate link.' } });
  }
};

export const getInterview = async (req: Request, res: Response) => {
  const id = owner(req, res);
  if (!id) return;
  if (!uuid.safeParse(paramId(req)).success) return validation(res, 'Invalid interview ID.');
  try {
    const data = await exitInterviewService.get(id, paramId(req));
    if (!data) return notFound(res);
    res.json({ success: true, data });
  } catch {
    res.status(500).json({ success: false, error: { code: 'INTERNAL_SERVER_ERROR', message: 'Could not load interview.' } });
  }
};

export const revokeInterview = async (req: Request, res: Response) => {
  const id = owner(req, res);
  if (!id) return;
  if (!uuid.safeParse(paramId(req)).success) return validation(res, 'Invalid interview ID.');
  try {
    const ok = await exitInterviewService.revoke(id, paramId(req), id);
    if (!ok) return res.status(400).json({ success: false, error: { code: 'NOT_REVOKABLE', message: 'Interview cannot be revoked.' } });
    res.json({ success: true, message: 'Interview link revoked.' });
  } catch {
    res.status(500).json({ success: false, error: { code: 'INTERNAL_SERVER_ERROR', message: 'Could not revoke interview.' } });
  }
};

export const reopenInterview = async (req: Request, res: Response) => {
  const id = owner(req, res);
  if (!id) return;
  if (!uuid.safeParse(paramId(req)).success) return validation(res, 'Invalid interview ID.');
  const p = reopenExitInterviewSchema.safeParse(req.body);
  if (!p.success) return validation(res, 'Explicit reopen confirmation is required.');
  try {
    const data = await exitInterviewService.reopen(id, paramId(req), id, p.data.expiryDays);
    if (!data) return notFound(res);
    res.json({ success: true, data });
  } catch {
    res.status(500).json({ success: false, error: { code: 'INTERNAL_SERVER_ERROR', message: 'Could not reopen interview.' } });
  }
};

// ---------------------------------------------------------------------------
// PUBLIC HOSTED FORM RESOLUTION & SUBMISSION
// ---------------------------------------------------------------------------

export const resolveShortLink = async (req: Request, res: Response) => {
  publicHeaders(res);
  const code = String(req.params.code || '').trim();

  if (!code || !/^[a-zA-Z0-9_-]{4,32}$/.test(code)) {
    return res.status(404).json({ success: false, error: { code: 'INVALID_CODE', message: 'Invalid survey link.' } });
  }

  try {
    const result = await exitInterviewService.resolveShortCode(code);

    if (result.status === 'ACTIVE') {
      return res.json({ success: true, data: result });
    }

    if (result.status === 'NOT_FOUND') {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Survey link not found.' } });
    }

    if (result.status === 'EXPIRED') {
      return res.status(410).json({
        success: false,
        error: { code: 'LINK_EXPIRED', message: 'This exit feedback link has expired. Please contact your HR team.' },
      });
    }

    if (result.status === 'CANCELLED') {
      return res.status(410).json({
        success: false,
        error: { code: 'LINK_CANCELLED', message: 'This survey invitation was cancelled or replaced.' },
      });
    }

    if (result.status === 'COMPLETED') {
      return res.status(200).json({
        success: true,
        status: 'COMPLETED',
        message: 'Thank you! Your exit feedback has already been received.',
      });
    }

    return res.status(400).json({ success: false, error: { code: 'UNAVAILABLE', message: 'Survey link is unavailable.' } });
  } catch (err) {
    logger.error({ message: (err as Error).message }, 'Error resolving exit feedback link');
    return res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: 'Could not resolve survey link.' } });
  }
};

export const submitPublicFeedback = async (req: Request, res: Response) => {
  publicHeaders(res);
  const code = String(req.params.code || '').trim();

  if (!code || !/^[a-zA-Z0-9_-]{4,32}$/.test(code)) {
    return res.status(400).json({ success: false, error: { code: 'INVALID_CODE', message: 'Invalid survey link.' } });
  }

  const parseResult = publicSubmitExitInterviewSchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'Invalid submission answers.', details: parseResult.error.flatten() },
    });
  }

  try {
    const metadata = {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
      submittedAt: new Date().toISOString(),
      ...(parseResult.data.metadata || {}),
    };

    const result = await exitInterviewService.submitPublicFeedback(code, parseResult.data.answers, metadata);

    if (!result.ok) {
      const status = result.reason === 'NOT_FOUND' ? 404 : result.reason === 'EXPIRED' || result.reason === 'CANCELLED' ? 410 : 400;
      return res.status(status).json({
        success: false,
        error: { code: result.reason || 'SUBMISSION_FAILED', message: result.reason || 'Could not submit feedback.' },
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Thank you! Your Exit Feedback Form has been successfully submitted.',
    });
  } catch (err) {
    logger.error({ message: (err as Error).message }, 'Error saving exit feedback submission');
    return res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: 'An internal error occurred while submitting your responses.' },
    });
  }
};

// ---------------------------------------------------------------------------
// RESPONSE DETAILS & EXPORT CONTROLLERS
// ---------------------------------------------------------------------------

export const getResponseDetail = async (req: Request, res: Response) => {
  const id = owner(req, res);
  if (!id) return;
  const interviewId = paramId(req);

  try {
    const detail = await exitInterviewService.getResponseDetail(id, interviewId);
    if (!detail) return notFound(res);
    res.json({ success: true, data: detail });
  } catch (err) {
    logger.error({ message: (err as Error).message }, 'Failed to load response detail');
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: 'Could not load response detail.' } });
  }
};

export const exportExcel = async (req: Request, res: Response) => {
  const id = owner(req, res);
  if (!id) return;

  try {
    const exportData = await exitInterviewService.getExportData(id, req.query as any);
    const buffer = generateResponsesExcel(exportData.companyName, exportData.items);

    const filename = `${exportData.companyName.replace(/[^a-zA-Z0-9_-]/g, '_')}_Exit_Responses_${new Date().toISOString().slice(0, 10)}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  } catch (err) {
    logger.error({ message: (err as Error).message }, 'Failed to export exit responses to Excel');
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: 'Failed to generate Excel export.' } });
  }
};

export const exportCsv = async (req: Request, res: Response) => {
  const id = owner(req, res);
  if (!id) return;

  try {
    const exportData = await exitInterviewService.getExportData(id, req.query as any);
    const csv = generateResponsesCsv(exportData.items);

    const filename = `${exportData.companyName.replace(/[^a-zA-Z0-9_-]/g, '_')}_Exit_Responses_${new Date().toISOString().slice(0, 10)}.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csv);
  } catch (err) {
    logger.error({ message: (err as Error).message }, 'Failed to export exit responses to CSV');
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: 'Failed to generate CSV export.' } });
  }
};

// ---------------------------------------------------------------------------
// EVALUATIONS & LEGACY TOKEN CONTROLLERS
// ---------------------------------------------------------------------------

export const getEvaluation = async (req: Request, res: Response) => {
  const id = owner(req, res);
  if (!id) return;
  try {
    const data = await exitInterviewService.getEvaluation(id, paramId(req));
    res.json({ success: true, data });
  } catch {
    res.status(500).json({ success: false, error: { code: 'INTERNAL_SERVER_ERROR', message: 'Could not load evaluation.' } });
  }
};

export const saveEvaluation = async (req: Request, res: Response) => {
  const id = owner(req, res);
  if (!id) return;
  const p = evaluationSchema.safeParse(req.body);
  if (!p.success) return validation(res);
  try {
    const data = await exitInterviewService.saveEvaluation(id, paramId(req), id, p.data);
    if (!data) return notFound(res);
    res.json({ success: true, data });
  } catch {
    res.status(500).json({ success: false, error: { code: 'INTERNAL_SERVER_ERROR', message: 'Could not save evaluation.' } });
  }
};

export const getPublicForm = async (req: Request, res: Response) => {
  publicHeaders(res);
  const token = String(req.params.token || '');
  if (!/^[a-f0-9]{64}$/.test(token)) return res.status(404).json({ success: false, error: { code: 'FORM_UNAVAILABLE', message: 'This form is unavailable.' } });
  try {
    const data = await exitInterviewService.publicForm(token);
    if (!data) return res.status(404).json({ success: false, error: { code: 'FORM_UNAVAILABLE', message: 'This form is unavailable.' } });
    res.json({ success: true, data });
  } catch {
    res.status(500).json({ success: false, error: { code: 'INTERNAL_SERVER_ERROR', message: 'Could not load this form.' } });
  }
};

export const submitPublicForm = async (req: Request, res: Response) => {
  publicHeaders(res);
  const token = String(req.params.token || '');
  if (!/^[a-f0-9]{64}$/.test(token)) return res.status(404).json({ success: false, error: { code: 'FORM_UNAVAILABLE', message: 'This form is unavailable.' } });
  const p = submitExitInterviewSchema.safeParse(req.body);
  if (!p.success) return validation(res, 'Invalid answers.');
  try {
    const result = await exitInterviewService.submit(token, p.data.answers);
    if (!result.ok) return res.status(result.reason === 'UNAVAILABLE' ? 404 : 400).json({ success: false, error: { code: result.reason === 'UNAVAILABLE' ? 'FORM_UNAVAILABLE' : 'INVALID_ANSWERS', message: result.reason === 'UNAVAILABLE' ? 'This form is unavailable.' : result.reason } });
    res.json({ success: true, message: 'Your responses have been submitted.' });
  } catch {
    res.status(500).json({ success: false, error: { code: 'INTERNAL_SERVER_ERROR', message: 'Could not submit responses.' } });
  }
};
