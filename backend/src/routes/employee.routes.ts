import { Router, type IRouter } from 'express';
import {
  getEmployees,
  getEmployeeById,
  createEmployee,
  updateEmployee,
  offboardEmployee,
} from '../controllers/employee.controller.js';
import { authenticateToken } from '../middleware/auth.middleware.js';

const router: IRouter = Router();

// Employee workspace endpoints - scoped to authenticated user's workspace
router.get('/', authenticateToken, getEmployees);
router.post('/', authenticateToken, createEmployee);
router.get('/:id', authenticateToken, getEmployeeById);
router.patch('/:id', authenticateToken, updateEmployee);
router.post('/:id/offboard', authenticateToken, offboardEmployee);

export default router;

