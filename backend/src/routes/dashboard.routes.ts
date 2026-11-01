import { Router, type IRouter } from 'express';
import { getDashboardStats, getPersonalDashboard } from '../controllers/dashboard.controller.js';
import { authenticateToken } from '../middleware/auth.middleware.js';

const router: IRouter = Router();

// Personal dashboard overview & tasks
router.get('/me', authenticateToken, getPersonalDashboard);

// Personal workspace stats (active employees, onboarding, offboarding, department breakdown, etc.)
router.get('/stats', authenticateToken, getDashboardStats);

export default router;

