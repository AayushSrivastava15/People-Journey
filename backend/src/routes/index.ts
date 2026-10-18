import { Router, type IRouter } from 'express';
import healthRoutes from './health.routes';
import authRoutes from './auth.routes';
import employeeRoutes from './employee.routes';
import masterRoutes from './master.routes';
import dashboardRoutes from './dashboard.routes';

const router: IRouter = Router();

router.use('/', healthRoutes);
router.use('/auth', authRoutes);
router.use('/employees', employeeRoutes);
router.use('/', masterRoutes);
router.use('/dashboard', dashboardRoutes);

export default router;
