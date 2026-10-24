import { Router, type IRouter } from 'express';
import {
  getSession,
  googleLogin,
  logout,
  getCurrentUserProfile,
  updateCurrentUserProfile,
} from '../controllers/auth.controller';
import { authenticateToken } from '../middleware/auth.middleware';

const router: IRouter = Router();

// Session and Google authentication endpoints
router.get('/session', authenticateToken, getSession);
router.get('/verify', authenticateToken, getSession); // compatibility alias
router.post('/verify', authenticateToken, getSession); // compatibility alias
router.post('/google', googleLogin);
router.post('/logout', logout);

// Current user profile endpoints
router.get('/me', authenticateToken, getCurrentUserProfile);
router.patch('/me', authenticateToken, updateCurrentUserProfile);

export default router;

