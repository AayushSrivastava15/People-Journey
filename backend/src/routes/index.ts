import { Router, type IRouter } from 'express';
import healthRoutes from './health.routes';
import authRoutes from './auth.routes';
import employeeRoutes from './employee.routes';
import masterRoutes from './master.routes';
import dashboardRoutes from './dashboard.routes';
import companyProfileRoutes from './company-profile.routes';
import emailTemplateRoutes from './email-template.routes';
import emailDraftRoutes from './email-draft.routes';

const router: IRouter = Router();

router.use('/', healthRoutes);
router.use('/auth', authRoutes);
router.use('/users', authRoutes);
router.use('/employees', employeeRoutes);
router.use('/', masterRoutes);
router.use('/dashboard', dashboardRoutes);
router.use('/company-profile', companyProfileRoutes);
router.use('/email-templates', emailTemplateRoutes);
router.use('/email-drafts', emailDraftRoutes);

export default router;
