import { Router, type IRouter } from 'express';
import {
  listTemplates,
  getTemplateById,
  createTemplate,
  updateTemplate,
  duplicateTemplate,
  deleteTemplate,
} from '../controllers/email-template.controller.js';
import { authenticateToken } from '../middleware/auth.middleware.js';

const router: IRouter = Router();

router.get('/', authenticateToken, listTemplates);
router.post('/', authenticateToken, createTemplate);
router.get('/:id', authenticateToken, getTemplateById);
router.patch('/:id', authenticateToken, updateTemplate);
router.post('/:id/duplicate', authenticateToken, duplicateTemplate);
router.delete('/:id', authenticateToken, deleteTemplate);

export default router;
