import type { Request, Response } from 'express';
import { masterService } from '../services/master.service';
import { CreateDepartmentSchema, CreateDesignationSchema } from '../models/master.model';
import { logger } from '../utils/logger';

export async function getDepartments(_req: Request, res: Response): Promise<void> {
  try {
    const departments = await masterService.getDepartments();
    res.status(200).json(departments);
  } catch (err) {
    const error = err as Error;
    logger.error({ message: error.message }, 'Failed to get departments');
    res.status(500).json({ error: 'InternalServerError', message: error.message });
  }
}

export async function createDepartment(req: Request, res: Response): Promise<void> {
  const parseResult = CreateDepartmentSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({
      error: 'ValidationError',
      issues: parseResult.error.format(),
    });
    return;
  }

  try {
    const created = await masterService.createDepartment(parseResult.data, req.user?.hrUserId);
    res.status(201).json(created);
  } catch (err) {
    const error = err as Error;
    if (error.message.includes('ORA-00001')) {
      res.status(409).json({ error: 'Conflict', message: 'Department name already exists.' });
      return;
    }
    logger.error({ message: error.message }, 'Failed to create department');
    res.status(500).json({ error: 'InternalServerError', message: error.message });
  }
}

export async function getDesignations(_req: Request, res: Response): Promise<void> {
  try {
    const designations = await masterService.getDesignations();
    res.status(200).json(designations);
  } catch (err) {
    const error = err as Error;
    logger.error({ message: error.message }, 'Failed to get designations');
    res.status(500).json({ error: 'InternalServerError', message: error.message });
  }
}

export async function createDesignation(req: Request, res: Response): Promise<void> {
  const parseResult = CreateDesignationSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({
      error: 'ValidationError',
      issues: parseResult.error.format(),
    });
    return;
  }

  try {
    const created = await masterService.createDesignation(parseResult.data, req.user?.hrUserId);
    res.status(201).json(created);
  } catch (err) {
    const error = err as Error;
    if (error.message.includes('ORA-00001')) {
      res.status(409).json({ error: 'Conflict', message: 'Designation name already exists.' });
      return;
    }
    logger.error({ message: error.message }, 'Failed to create designation');
    res.status(500).json({ error: 'InternalServerError', message: error.message });
  }
}
