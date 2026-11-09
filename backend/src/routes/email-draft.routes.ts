import { Router, type IRouter } from 'express';
import {
  previewDraft,
  createDraft,
  listDrafts,
  getDraftById,
  updateDraftStatus,
} from '../controllers/email-draft.controller.js';
import { authenticateToken } from '../middleware/auth.middleware.js';
import { emailLimiter } from '../middleware/rate-limiter.js';

const router: IRouter = Router();

router.use(authenticateToken);

// Email operations protected by emailLimiter (5 operations/min per user)
router.post('/preview', emailLimiter, previewDraft);
router.post('/', emailLimiter, createDraft);

// Retrieval & status updates
router.get('/', listDrafts);
router.get('/:id', getDraftById);
router.patch('/:id/status', updateDraftStatus);

export default router;
