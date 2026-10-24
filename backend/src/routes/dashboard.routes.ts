import { Router, type IRouter } from 'express';
import { getDashboardStats, getPersonalDashboard } from '../controllers/dashboard.controller';
import { authenticateToken } from '../middleware/auth.middleware';

const router: IRouter = Router();

// Personal dashboard overview & tasks
router.get('/me', authenticateToken, getPersonalDashboard);

// Personal workspace stats (active employees, onboarding, offboarding, department breakdown, etc.)
router.get('/stats', authenticateToken, getDashboardStats);

export default router;

