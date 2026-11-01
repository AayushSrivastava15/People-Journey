import { Router, type IRouter } from 'express';
import {
  getDepartments,
  createDepartment,
  getDesignations,
  createDesignation,
} from '../controllers/master.controller.js';
import { authenticateToken } from '../middleware/auth.middleware.js';

const router: IRouter = Router();

// Departments
router.get('/departments', authenticateToken, getDepartments);
router.post('/departments', authenticateToken, createDepartment);

// Designations
router.get('/designations', authenticateToken, getDesignations);
router.post('/designations', authenticateToken, createDesignation);

export default router;

