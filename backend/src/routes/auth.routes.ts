import { Router, type IRouter } from 'express';
import {
  verifyAuth,
  listHrUsers,
  createHrUser,
  updateHrUser,
} from '../controllers/auth.controller';
import { authenticateToken, requireAdmin } from '../middleware/auth.middleware';

const router: IRouter = Router();

// Session verification
router.get('/verify', authenticateToken, verifyAuth);
router.post('/verify', authenticateToken, verifyAuth);

// HR User administration (hr_admin only)
router.get('/users', authenticateToken, requireAdmin, listHrUsers);
router.post('/users', authenticateToken, requireAdmin, createHrUser);
router.patch('/users/:id', authenticateToken, requireAdmin, updateHrUser);

export default router;
