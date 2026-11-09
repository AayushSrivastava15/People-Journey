import { Router, type IRouter } from 'express';
import { authenticateToken } from '../middleware/auth.middleware.js';
import { publicExitLimiter, exportLimiter } from '../middleware/rate-limiter.js';
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

// Public employee short-code resolution & native hosted feedback submission (protected by publicExitLimiter: 20 req/min per IP)
router.get('/resolve/:code', publicExitLimiter, resolveShortLink);
router.post('/submit/:code', publicExitLimiter, submitPublicFeedback);

// Legacy public form routes
router.get('/public/:token', publicExitLimiter, getPublicForm);
router.post('/public/:token/submit', publicExitLimiter, submitPublicForm);

// Authenticated HR Manager routes
router.use(authenticateToken);

// Reports & Bulk Exports (protected by exportLimiter: 5 exports/min per user)
router.get('/export/excel', exportLimiter, exportExcel);
router.get('/export/csv', exportLimiter, exportCsv);

// Company Template Management
router.get('/template', getCompanyTemplate);
router.put('/template', updateTemplateDraft);
router.post('/template/publish', publishTemplate);
router.post('/template/reset-default', resetTemplateToDefault);
router.get('/templates', listTemplates);

// Responses Detail
router.get('/responses/:id', getResponseDetail);

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
