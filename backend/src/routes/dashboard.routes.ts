import { Router, type IRouter } from 'express';
import { getDashboardStats } from '../controllers/dashboard.controller';
import { authenticateToken } from '../middleware/auth.middleware';

const router: IRouter = Router();

router.get('/stats', authenticateToken, getDashboardStats);

export default router;
