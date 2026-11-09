import { Router, type IRouter } from 'express';
import {
  getEmployees,
  getEmployeeById,
  createEmployee,
  updateEmployee,
  offboardEmployee,
} from '../controllers/employee.controller.js';
import { authenticateToken } from '../middleware/auth.middleware.js';
import { employeeLimiter } from '../middleware/rate-limiter.js';

const router: IRouter = Router();

// Employee workspace endpoints - scoped to authenticated user and protected by employeeLimiter (30 req/min per user)
router.use(authenticateToken);
router.use(employeeLimiter);

router.get('/', getEmployees);
router.post('/', createEmployee);
router.get('/:id', getEmployeeById);
router.patch('/:id', updateEmployee);
router.post('/:id/offboard', offboardEmployee);

export default router;
