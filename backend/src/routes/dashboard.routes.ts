import { Router, type IRouter } from 'express';
import { getDashboardStats, getPersonalDashboard } from '../controllers/dashboard.controller.js';
import { authenticateToken } from '../middleware/auth.middleware.js';
import { dashboardLimiter } from '../middleware/rate-limiter.js';

const router: IRouter = Router();

// All dashboard endpoints require authentication and are protected by the dashboard rate limiter (30 req/min per user)
router.use(authenticateToken);
router.use(dashboardLimiter);

// Personal dashboard overview & tasks
router.get('/me', getPersonalDashboard);

// Personal workspace stats (active employees, onboarding, offboarding, department breakdown, etc.)
router.get('/stats', getDashboardStats);

export default router;
