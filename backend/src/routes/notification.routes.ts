import { Router, type IRouter } from 'express';
import { authenticateToken } from '../middleware/auth.middleware.js';
import { getNotifications, markAsRead, markAllAsRead } from '../controllers/notification.controller.js';

const router: IRouter = Router();

router.use(authenticateToken);

router.get('/', getNotifications);
router.patch('/mark-all-read', markAllAsRead);
router.patch('/:id/read', markAsRead);

export default router;
