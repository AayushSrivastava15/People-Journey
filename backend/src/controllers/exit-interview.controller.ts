import type { Request, Response } from 'express';
import { z } from 'zod';
import {
  createExitInterviewSchema,
  evaluationSchema,
  googleFormsWebhookSchema,
  listExitInterviewsSchema,
  regenerateExitInterviewSchema,
  reopenExitInterviewSchema,
  submitExitInterviewSchema,
} from '../models/exit-interview.model.js';
import { exitInterviewService } from '../services/exit-interview.service.js';
import { logger } from '../utils/logger.js';
import { env } from '../config/env.js';

const uuid = z.string().uuid();

function owner(req: Request, res: Response): string | null {
  const id = req.user?.id;
  if (id) return id;
  res.status(401).json({ success: false, error: { code: 'UNAUTHENTICATED', message: 'Authentication required.' } });
  return null;
}

function validation(res: Response, message = 'Invalid request.') {
  res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message } });
}

function notFound(res: Response) {
  res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Record not found.' } });
}

function publicHeaders(res: Response) {
  res.set({
    'Cache-Control': 'no-store, no-cache, must-revalidate, private',
    Pragma: 'no-cache',
    'Referrer-Policy': 'no-referrer',
  });
}

function paramId(req: Request): string {
  const value = req.params.id;
  return Array.isArray(value) ? value[0] || '' : value || '';
}

function renderFeedbackPage(title: string, message: string, isSuccess = false): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} | People Journey</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      background: #faf6f4;
      color: #443942;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      padding: 20px;
    }
    .card {
      background: #ffffff;
      border: 1px solid #eadfe0;
      border-radius: 16px;
      max-width: 480px;
      width: 100%;
      padding: 36px 32px;
      text-align: center;
      box-shadow: 0 10px 30px rgba(68, 57, 66, 0.06);
    }
    .icon {
      width: 52px;
      height: 52px;
      margin: 0 auto 18px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 24px;
      background: ${isSuccess ? '#ecfdf5' : '#fff5f7'};
      color: ${isSuccess ? '#059669' : '#b67c90'};
      border: 1px solid ${isSuccess ? '#a7f3d0' : '#f8dbe3'};
    }
    h1 {
      font-size: 20px;
      font-weight: 700;
      color: #3b2f37;
      margin-bottom: 10px;
      letter-spacing: -0.02em;
    }
    p {
      font-size: 14px;
      line-height: 1.6;
      color: #72626c;
      margin-bottom: 24px;
    }
    .brand {
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: #a58e99;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">${isSuccess ? '✓' : '!'}</div>
    <h1>${title}</h1>
    <p>${message}</p>
    <div class="brand">People Journey HR Portal</div>
  </div>
</body>
</html>`;
}

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
      ACTIVE_INTERVIEW_EXISTS: [409, 'CONFLICT', 'An active interview already exists for this exit event.'],
    };
    if (map[m]) {
      const [status, code, message] = map[m];
      res.status(status).json({ success: false, error: { code, message } });
      return;
    }
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
    if (!(await exitInterviewService.revoke(id, paramId(req), id))) return notFound(res);
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
  if (!p.success) return validation(res, 'Explicit confirmation and valid expiry are required.');
  try {
    const data = await exitInterviewService.reopen(id, paramId(req), id, p.data.expiryDays);
    if (!data) return res.status(409).json({ success: false, error: { code: 'INVALID_STATUS', message: 'Only completed interviews can be reopened.' } });
    res.json({ success: true, data });
  } catch {
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: 'Could not reopen interview.' } });
  }
};

export const getResponses = async (req: Request, res: Response) => {
  const id = owner(req, res);
  if (!id) return;
  if (!uuid.safeParse(paramId(req)).success) return validation(res, 'Invalid interview ID.');
  try {
    const rows = await exitInterviewService.responses(id, paramId(req));
    const record = await exitInterviewService.get(id, paramId(req));
    if (!record) return notFound(res);
    res.json({ success: true, data: rows, rawPayload: record.rawResponsePayload || null });
  } catch {
    res.status(500).json({ success: false, error: { code: 'INTERNAL_SERVER_ERROR', message: 'Could not load responses.' } });
  }
};

export const getEvaluation = async (req: Request, res: Response) => {
  const id = owner(req, res);
  if (!id) return;
  if (!uuid.safeParse(paramId(req)).success) return validation(res, 'Invalid interview ID.');
  try {
    const data = await exitInterviewService.getEvaluation(id, paramId(req));
    const record = data || (await exitInterviewService.get(id, paramId(req)));
    if (!record) return notFound(res);
    res.json({ success: true, data: data || null });
  } catch {
    res.status(500).json({ success: false, error: { code: 'INTERNAL_SERVER_ERROR', message: 'Could not load evaluation.' } });
  }
};

export const updateEvaluation = async (req: Request, res: Response) => {
  const id = owner(req, res);
  if (!id) return;
  if (!uuid.safeParse(paramId(req)).success) return validation(res, 'Invalid interview ID.');
  const p = evaluationSchema.safeParse(req.body);
  if (!p.success) return validation(res, 'Invalid evaluation fields.');
  try {
    if (!(await exitInterviewService.updateEvaluation(id, paramId(req), id, p.data))) return notFound(res);
    res.json({ success: true, data: await exitInterviewService.getEvaluation(id, paramId(req)) });
  } catch {
    res.status(500).json({ success: false, error: { code: 'INTERNAL_SERVER_ERROR', message: 'Could not save evaluation.' } });
  }
};

/**
 * Resolves short link /e/:code.
 * Browser requests are 302 redirected to prefilled Google Forms URL or served a status page.
 * JSON API requests receive structured status and redirect details.
 */
export const resolveShortLink = async (req: Request, res: Response) => {
  publicHeaders(res);
  const code = String(req.params.code || '').trim();
  const acceptsJson = req.accepts('json') && !req.accepts('html');

  if (!code || !/^[a-zA-Z0-9_-]{4,32}$/.test(code)) {
    if (acceptsJson) return res.status(404).json({ success: false, error: { code: 'INVALID_CODE', message: 'Invalid short code.' } });
    return res.status(404).send(renderFeedbackPage('Link Not Found', 'This exit feedback link is invalid or malformed.'));
  }

  try {
    const result = await exitInterviewService.resolveShortCode(code);

    if (result.status === 'ACTIVE') {
      if (acceptsJson) {
        return res.json({ success: true, redirectUrl: result.redirectUrl, employee: result.employee });
      }
      return res.redirect(302, result.redirectUrl);
    }

    if (result.status === 'NOT_FOUND') {
      if (acceptsJson) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Link not found.' } });
      return res.status(404).send(renderFeedbackPage('Link Not Found', 'This exit feedback link does not exist or has expired.'));
    }

    if (result.status === 'EXPIRED') {
      if (acceptsJson) return res.status(410).json({ success: false, error: { code: 'LINK_EXPIRED', message: 'Link has expired.' } });
      return res.status(410).send(renderFeedbackPage('Feedback Link Expired', 'This survey link has expired. Please contact your HR team if you still wish to submit feedback.'));
    }

    if (result.status === 'CANCELLED') {
      if (acceptsJson) return res.status(410).json({ success: false, error: { code: 'LINK_CANCELLED', message: 'Link was cancelled.' } });
      return res.status(410).send(renderFeedbackPage('Invitation Cancelled', 'This feedback invitation has been cancelled or replaced by your HR department.'));
    }

    if (result.status === 'COMPLETED') {
      if (acceptsJson) return res.status(200).json({ success: true, status: 'COMPLETED', message: 'Feedback already submitted.' });
      return res.status(200).send(renderFeedbackPage('Feedback Already Submitted', 'Thank you! Your exit feedback has already been received and recorded.', true));
    }

    return res.status(400).send(renderFeedbackPage('Link Unavailable', 'This feedback link cannot be accessed at this time.'));
  } catch (err) {
    logger.error({ message: (err as Error).message }, 'Error resolving exit feedback short link');
    if (acceptsJson) return res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: 'Could not resolve link.' } });
    return res.status(500).send(renderFeedbackPage('Service Temporarily Unavailable', 'We could not connect to the survey service. Please try again shortly.'));
  }
};

/**
 * Webhook handler for Google Forms / Google Apps Script submissions.
 * Validates secret header and synchronizes response to PostgreSQL.
 */
export const handleGoogleFormsWebhook = async (req: Request, res: Response) => {
  const secretHeader = req.headers['x-webhook-secret'] || req.headers['authorization'];
  const expectedSecret = env.GOOGLE_FORMS_WEBHOOK_SECRET;

  const providedSecret = typeof secretHeader === 'string'
    ? secretHeader.replace(/^Bearer\s+/i, '').trim()
    : '';

  if (!providedSecret || providedSecret !== expectedSecret) {
    logger.warn({ ip: req.ip }, 'Unauthorized Google Forms webhook attempt');
    return res.status(401).json({
      success: false,
      error: { code: 'UNAUTHORIZED_WEBHOOK', message: 'Invalid or missing webhook authentication secret.' },
    });
  }

  const parseResult = googleFormsWebhookSchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'Invalid webhook payload structure.', details: parseResult.error.flatten() },
    });
  }

  try {
    const result = await exitInterviewService.handleGoogleFormsWebhook(parseResult.data);
    if (!result.success) {
      const status = result.code === 'INVITATION_NOT_FOUND' ? 404 : 400;
      return res.status(status).json({
        success: false,
        error: { code: result.code || 'WEBHOOK_FAILED', message: result.message },
      });
    }

    logger.info({ interviewId: result.interviewId }, 'Exit interview response synchronized from Google Forms webhook');
    return res.status(200).json({
      success: true,
      message: result.message,
      interviewId: result.interviewId,
    });
  } catch (err) {
    logger.error({ message: (err as Error).message }, 'Error handling Google Forms webhook');
    return res.status(500).json({
      success: false,
      error: { code: 'WEBHOOK_INTERNAL_ERROR', message: 'Internal error processing webhook submission.' },
    });
  }
};

// Legacy public token endpoints preserved for backward compatibility
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
