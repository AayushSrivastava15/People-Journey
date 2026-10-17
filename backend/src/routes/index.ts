import { Router, type IRouter } from 'express';
import healthRoutes from './health.routes';
import authRoutes from './auth.routes';

const router: IRouter = Router();

router.use('/', healthRoutes);
router.use('/auth', authRoutes);

export default router;
