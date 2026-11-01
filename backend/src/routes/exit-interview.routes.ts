import { Router, type IRouter } from 'express';
import rateLimit from 'express-rate-limit';
import { authenticateToken } from '../middleware/auth.middleware.js';
import { createInterview, getEvaluation, getInterview, getPublicForm, getResponses, listInterviews, listTemplates, reopenInterview, revokeInterview, submitPublicForm, updateEvaluation } from '../controllers/exit-interview.controller.js';

const router: IRouter = Router();
const publicLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 30, standardHeaders: 'draft-7', legacyHeaders: false, message: {success:false,error:{code:'RATE_LIMIT_EXCEEDED',message:'Too many form requests. Please try again later.'}} });

// Public employee routes are deliberately mounted before HR authentication.
router.get('/public/:token', publicLimiter, getPublicForm);
router.post('/public/:token/submit', publicLimiter, submitPublicForm);

router.use(authenticateToken);
router.get('/templates', listTemplates);
router.get('/', listInterviews);
router.post('/', createInterview);
router.get('/:id', getInterview);
router.post('/:id/revoke', revokeInterview);
router.post('/:id/reopen', reopenInterview);
router.get('/:id/responses', getResponses);
router.get('/:id/evaluation', getEvaluation);
router.put('/:id/evaluation', updateEvaluation);

export default router;
