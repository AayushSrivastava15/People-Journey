import { Router, type IRouter } from 'express';
import {
  getSession,
  googleLogin,
  logout,
  getCurrentUserProfile,
  updateCurrentUserProfile,
} from '../controllers/auth.controller.js';
import { authenticateToken } from '../middleware/auth.middleware.js';
import { authLimiter } from '../middleware/rate-limiter.js';

const router: IRouter = Router();

// Session and Google authentication endpoints (protected by 10 req / 15 min per IP limiter)
router.post('/google', authLimiter, googleLogin);
router.post('/logout', authLimiter, logout);
router.get('/session', authLimiter, authenticateToken, getSession);
router.get('/verify', authLimiter, authenticateToken, getSession); // compatibility alias
router.post('/verify', authLimiter, authenticateToken, getSession); // compatibility alias

// Current user profile endpoints
router.get('/me', authenticateToken, getCurrentUserProfile);
router.patch('/me', authenticateToken, updateCurrentUserProfile);

export default router;
