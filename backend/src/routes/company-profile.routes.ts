import { Router, type IRouter } from 'express';
import { getCompanyProfile, updateCompanyProfile } from '../controllers/company-profile.controller.js';
import { authenticateToken } from '../middleware/auth.middleware.js';

const router: IRouter = Router();

router.get('/', authenticateToken, getCompanyProfile);
router.put('/', authenticateToken, updateCompanyProfile);

export default router;
