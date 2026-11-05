import { Router, type IRouter } from 'express';
import rateLimit from 'express-rate-limit';
import { authenticateToken } from '../middleware/auth.middleware.js';
import {
  createInterview,
  exportCsv,
  exportExcel,
  getCompanyTemplate,
  getEvaluation,
  getInterview,
  getPublicForm,
  getResponseDetail,
  listInterviews,
  listTemplates,
  publishTemplate,
  regenerateInterview,
  reopenInterview,
  resetTemplateToDefault,
  resolveShortLink,
  revokeInterview,
  saveEvaluation,
  submitPublicFeedback,
  submitPublicForm,
  updateTemplateDraft,
} from '../controllers/exit-interview.controller.js';

const router: IRouter = Router();

const publicLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 120,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: {
    success: false,
    error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Too many requests. Please try again later.' },
  },
});

const submitLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: {
    success: false,
    error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Submission rate limit reached. Please wait before retrying.' },
  },
});

// Public employee short-code resolution & native hosted feedback submission
router.get('/resolve/:code', publicLimiter, resolveShortLink);
router.post('/submit/:code', submitLimiter, submitPublicFeedback);

// Legacy public form routes
router.get('/public/:token', publicLimiter, getPublicForm);
router.post('/public/:token/submit', submitLimiter, submitPublicForm);

// Authenticated HR Manager routes
router.use(authenticateToken);

// Company Template Management
router.get('/template', getCompanyTemplate);
router.put('/template', updateTemplateDraft);
router.post('/template/publish', publishTemplate);
router.post('/template/reset-default', resetTemplateToDefault);
router.get('/templates', listTemplates);

// Responses & Exports
router.get('/responses/:id', getResponseDetail);
router.get('/export/excel', exportExcel);
router.get('/export/csv', exportCsv);

// Standard Exit Interview CRUD
router.get('/', listInterviews);
router.post('/', createInterview);
router.get('/:id', getInterview);
router.post('/:id/revoke', revokeInterview);
router.post('/:id/regenerate', regenerateInterview);
router.post('/:id/reopen', reopenInterview);
router.get('/:id/evaluation', getEvaluation);
router.put('/:id/evaluation', saveEvaluation);

export default router;
