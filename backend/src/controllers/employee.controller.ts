import type { Request, Response } from 'express';
import { employeeService } from '../services/employee.service.js';
import {
  CreateEmployeeSchema,
  UpdateEmployeeSchema,
  OffboardEmployeeSchema,
  EmployeeQuerySchema,
} from '../models/employee.model.js';
import { logger } from '../utils/logger.js';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function parseEmployeeIdentifier(raw: unknown): number | string | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  const trimmed = typeof value === 'string' ? value.trim() : String(value || '').trim();
  if (UUID_REGEX.test(trimmed)) {
    return trimmed;
  }
  const numeric = Number(trimmed);
  if (!isNaN(numeric) && Number.isInteger(numeric) && numeric > 0) {
    return numeric;
  }
  return null;
}

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

  const employeeIdentifier = parseEmployeeIdentifier(req.params.id);
  if (employeeIdentifier === null) {
    res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid employee ID or UUID parameter.',
      },
    });
    return;
  }

  try {
    const employee = await employeeService.getEmployeeById(employeeIdentifier, userId);
    if (!employee) {
      res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: `Employee with identifier ${req.params.id} not found in your workspace.`,
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

  const employeeIdentifier = parseEmployeeIdentifier(req.params.id);
  if (employeeIdentifier === null) {
    res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid employee ID or UUID parameter.',
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
    const updated = await employeeService.updateEmployee(employeeIdentifier, parseResult.data, userId);
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

  const employeeIdentifier = parseEmployeeIdentifier(req.params.id);
  if (employeeIdentifier === null) {
    res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid employee ID or UUID parameter.',
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
    const result = await employeeService.offboardEmployee(employeeIdentifier, parseResult.data, userId);
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

export async function deleteEmployee(req: Request, res: Response): Promise<void> {
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

  const employeeIdentifier = parseEmployeeIdentifier(req.params.id);
  if (employeeIdentifier === null) {
    res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid employee ID or UUID parameter.',
      },
    });
    return;
  }

  try {
    const success = await employeeService.deleteEmployee(employeeIdentifier, userId);
    if (!success) {
      res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: `Employee with identifier ${req.params.id} not found in your workspace.`,
        },
      });
      return;
    }

    res.status(200).json({
      success: true,
      message: 'Employee successfully removed from active workspace.',
      employeeIdentifier,
    });
  } catch (err) {
    const error = err as Error;
    logger.error({ message: error.message, employeeIdentifier }, 'Failed to delete employee');
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: error.message,
      },
    });
  }
}
