import type { Request, Response } from 'express';
import { masterService } from '../services/master.service.js';
import { CreateDepartmentSchema, CreateDesignationSchema } from '../models/master.model.js';
import { logger } from '../utils/logger.js';

export async function getDepartments(req: Request, res: Response): Promise<void> {
  try {
    const departments = await masterService.getDepartments(req.user?.id);
    res.status(200).json(departments);
  } catch (err) {
    const error = err as Error;
    logger.error({ message: error.message }, 'Failed to get departments');
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: error.message,
      },
    });
  }
}

export async function createDepartment(req: Request, res: Response): Promise<void> {
  const parseResult = CreateDepartmentSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid department data.',
        issues: parseResult.error.format(),
      },
    });
    return;
  }

  try {
    const created = await masterService.createDepartment(parseResult.data, req.user?.id);
    res.status(201).json(created);
  } catch (err) {
    const error = err as Error;
    if (error.message.includes('already exists') || (error as { code?: string }).code === '23505') {
      res.status(409).json({
        success: false,
        error: {
          code: 'CONFLICT',
          message: 'Department name already exists.',
        },
      });
      return;
    }
    logger.error({ message: error.message }, 'Failed to create department');
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: error.message,
      },
    });
  }
}

export async function getDesignations(req: Request, res: Response): Promise<void> {
  try {
    const designations = await masterService.getDesignations(req.user?.id);
    res.status(200).json(designations);
  } catch (err) {
    const error = err as Error;
    logger.error({ message: error.message }, 'Failed to get designations');
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: error.message,
      },
    });
  }
}

export async function createDesignation(req: Request, res: Response): Promise<void> {
  const parseResult = CreateDesignationSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid designation data.',
        issues: parseResult.error.format(),
      },
    });
    return;
  }

  try {
    const created = await masterService.createDesignation(parseResult.data, req.user?.id);
    res.status(201).json(created);
  } catch (err) {
    const error = err as Error;
    if (error.message.includes('already exists') || (error as { code?: string }).code === '23505') {
      res.status(409).json({
        success: false,
        error: {
          code: 'CONFLICT',
          message: 'Designation name already exists.',
        },
      });
      return;
    }
    logger.error({ message: error.message }, 'Failed to create designation');
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: error.message,
      },
    });
  }
}
