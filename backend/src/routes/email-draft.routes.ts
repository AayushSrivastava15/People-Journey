import { Router, type IRouter } from 'express';
import {
  previewDraft,
  createDraft,
  listDrafts,
  getDraftById,
  updateDraftStatus,
} from '../controllers/email-draft.controller';
import { authenticateToken } from '../middleware/auth.middleware';

const router: IRouter = Router();

router.post('/preview', authenticateToken, previewDraft);
router.get('/', authenticateToken, listDrafts);
router.post('/', authenticateToken, createDraft);
router.get('/:id', authenticateToken, getDraftById);
router.patch('/:id/status', authenticateToken, updateDraftStatus);

export default router;
