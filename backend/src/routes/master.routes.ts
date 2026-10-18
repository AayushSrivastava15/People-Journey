import { Router, type IRouter } from 'express';
import {
  getDepartments,
  createDepartment,
  getDesignations,
  createDesignation,
} from '../controllers/master.controller';
import { authenticateToken } from '../middleware/auth.middleware';

const router: IRouter = Router();

router.get('/departments', authenticateToken, getDepartments);
router.post('/departments', authenticateToken, createDepartment);

router.get('/designations', authenticateToken, getDesignations);
router.post('/designations', authenticateToken, createDesignation);

export default router;
