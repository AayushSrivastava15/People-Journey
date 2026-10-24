import type { Request, Response } from 'express';
import { employeeService } from '../services/employee.service';
import {
  CreateEmployeeSchema,
  UpdateEmployeeSchema,
  OffboardEmployeeSchema,
  EmployeeQuerySchema,
} from '../models/employee.model';
import { logger } from '../utils/logger';

export async function getEmployees(req: Request, res: Response): Promise<void> {
  const userId = req.user?.id;
  if (!userId) {
    res.status(401).json({
      success: false,
      error: {
        code: 'UNAUTHENTICATED',
        message: 'Authentication required.',
      },
    });
    return;
  }

  const parseResult = EmployeeQuerySchema.safeParse(req.query);
  if (!parseResult.success) {
    res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid query parameters.',
        issues: parseResult.error.format(),
      },
    });
    return;
  }

  try {
    const result = await employeeService.listEmployees(parseResult.data, userId);
    res.status(200).json(result);
  } catch (err) {
    const error = err as Error;
    logger.error({ message: error.message }, 'Failed to fetch employees');
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: error.message,
      },
    });
  }
}

export async function getEmployeeById(req: Request, res: Response): Promise<void> {
  const userId = req.user?.id;
  if (!userId) {
    res.status(401).json({
      success: false,
      error: {
        code: 'UNAUTHENTICATED',
        message: 'Authentication required.',
      },
    });
    return;
  }

  const employeeId = Number(req.params.id);
  if (isNaN(employeeId)) {
    res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid employee ID parameter.',
      },
    });
    return;
  }

  try {
    const employee = await employeeService.getEmployeeById(employeeId, userId);
    if (!employee) {
      res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: `Employee with ID ${employeeId} not found in your workspace.`,
        },
      });
      return;
    }
    res.status(200).json(employee);
  } catch (err) {
    const error = err as Error;
    logger.error({ message: error.message }, 'Failed to fetch employee by ID');
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: error.message,
      },
    });
  }
}

export async function createEmployee(req: Request, res: Response): Promise<void> {
  const userId = req.user?.id;
  if (!userId) {
    res.status(401).json({
      success: false,
      error: {
        code: 'UNAUTHENTICATED',
        message: 'Authentication required.',
      },
    });
    return;
  }

  const parseResult = CreateEmployeeSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid employee creation data.',
        issues: parseResult.error.format(),
      },
    });
    return;
  }

  try {
    const created = await employeeService.createEmployee(parseResult.data, userId);
    res.status(201).json(created);
  } catch (err) {
    const error = err as Error;
    if (error.message.includes('already exists')) {
      res.status(409).json({
        success: false,
        error: {
          code: 'CONFLICT',
          message: error.message,
        },
      });
      return;
    }
    logger.error({ message: error.message }, 'Failed to create employee');
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: error.message,
      },
    });
  }
}

export async function updateEmployee(req: Request, res: Response): Promise<void> {
  const userId = req.user?.id;
  if (!userId) {
    res.status(401).json({
      success: false,
      error: {
        code: 'UNAUTHENTICATED',
        message: 'Authentication required.',
      },
    });
    return;
  }

  const employeeId = Number(req.params.id);
  if (isNaN(employeeId)) {
    res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid employee ID parameter.',
      },
    });
    return;
  }

  const parseResult = UpdateEmployeeSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid employee update data.',
        issues: parseResult.error.format(),
      },
    });
    return;
  }

  try {
    const updated = await employeeService.updateEmployee(employeeId, parseResult.data, userId);
    res.status(200).json(updated);
  } catch (err) {
    const error = err as Error;
    if (error.message.includes('not found')) {
      res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: error.message,
        },
      });
      return;
    }
    logger.error({ message: error.message }, 'Failed to update employee');
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: error.message,
      },
    });
  }
}

export async function offboardEmployee(req: Request, res: Response): Promise<void> {
  const userId = req.user?.id;
  if (!userId) {
    res.status(401).json({
      success: false,
      error: {
        code: 'UNAUTHENTICATED',
        message: 'Authentication required.',
      },
    });
    return;
  }

  const employeeId = Number(req.params.id);
  if (isNaN(employeeId)) {
    res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid employee ID parameter.',
      },
    });
    return;
  }

  const parseResult = OffboardEmployeeSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid offboarding data.',
        issues: parseResult.error.format(),
      },
    });
    return;
  }

  try {
    const result = await employeeService.offboardEmployee(employeeId, parseResult.data, userId);
    res.status(200).json(result);
  } catch (err) {
    const error = err as Error;
    if (error.message.includes('not found')) {
      res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: error.message,
        },
      });
      return;
    }
    if (error.message.includes('Cannot schedule') || error.message.includes('already exists')) {
      res.status(409).json({
        success: false,
        error: {
          code: 'CONFLICT',
          message: error.message,
        },
      });
      return;
    }
    logger.error({ message: error.message }, 'Failed to offboard employee');
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: error.message,
      },
    });
  }
}
