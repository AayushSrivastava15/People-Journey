import { Router, type IRouter } from 'express';
import {
  getEmployees,
  getEmployeeById,
  createEmployee,
  updateEmployee,
  offboardEmployee,
} from '../controllers/employee.controller';
import { authenticateToken } from '../middleware/auth.middleware';

const router: IRouter = Router();

router.get('/', authenticateToken, getEmployees);
router.post('/', authenticateToken, createEmployee);
router.get('/:id', authenticateToken, getEmployeeById);
router.patch('/:id', authenticateToken, updateEmployee);
router.post('/:id/offboard', authenticateToken, offboardEmployee);

export default router;
