import { Router, type IRouter } from 'express';
import healthRoutes from './health.routes.js';
import authRoutes from './auth.routes.js';
import employeeRoutes from './employee.routes.js';
import masterRoutes from './master.routes.js';
import dashboardRoutes from './dashboard.routes.js';
import companyProfileRoutes from './company-profile.routes.js';
import emailTemplateRoutes from './email-template.routes.js';
import emailDraftRoutes from './email-draft.routes.js';
import exitInterviewRoutes from './exit-interview.routes.js';
import notificationRoutes from './notification.routes.js';

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
router.use('/exit-interviews', exitInterviewRoutes);
router.use('/notifications', notificationRoutes);

export default router;
