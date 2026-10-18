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
  const parseResult = EmployeeQuerySchema.safeParse(req.query);
  if (!parseResult.success) {
    res.status(400).json({
      error: 'ValidationError',
      issues: parseResult.error.format(),
    });
    return;
  }

  try {
    const result = await employeeService.listEmployees(parseResult.data);
    res.status(200).json(result);
  } catch (err) {
    const error = err as Error;
    logger.error({ message: error.message }, 'Failed to fetch employees');
    res.status(500).json({ error: 'InternalServerError', message: error.message });
  }
}

export async function getEmployeeById(req: Request, res: Response): Promise<void> {
  const employeeId = Number(req.params.id);
  if (isNaN(employeeId)) {
    res.status(400).json({ error: 'ValidationError', message: 'Invalid employee ID parameter.' });
    return;
  }

  try {
    const employee = await employeeService.getEmployeeById(employeeId);
    if (!employee) {
      res.status(404).json({ error: 'NotFound', message: `Employee with ID ${employeeId} not found.` });
      return;
    }
    res.status(200).json(employee);
  } catch (err) {
    const error = err as Error;
    logger.error({ message: error.message }, 'Failed to fetch employee by ID');
    res.status(500).json({ error: 'InternalServerError', message: error.message });
  }
}

export async function createEmployee(req: Request, res: Response): Promise<void> {
  const parseResult = CreateEmployeeSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({
      error: 'ValidationError',
      issues: parseResult.error.format(),
    });
    return;
  }

  try {
    const created = await employeeService.createEmployee(parseResult.data, req.user?.hrUserId);
    res.status(201).json(created);
  } catch (err) {
    const error = err as Error;
    if (error.message.includes('already exists')) {
      res.status(409).json({ error: 'Conflict', message: error.message });
      return;
    }
    logger.error({ message: error.message }, 'Failed to create employee');
    res.status(500).json({ error: 'InternalServerError', message: error.message });
  }
}

export async function updateEmployee(req: Request, res: Response): Promise<void> {
  const employeeId = Number(req.params.id);
  if (isNaN(employeeId)) {
    res.status(400).json({ error: 'ValidationError', message: 'Invalid employee ID parameter.' });
    return;
  }

  const parseResult = UpdateEmployeeSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({
      error: 'ValidationError',
      issues: parseResult.error.format(),
    });
    return;
  }

  try {
    const updated = await employeeService.updateEmployee(employeeId, parseResult.data, req.user?.hrUserId);
    res.status(200).json(updated);
  } catch (err) {
    const error = err as Error;
    if (error.message.includes('not found')) {
      res.status(404).json({ error: 'NotFound', message: error.message });
      return;
    }
    logger.error({ message: error.message }, 'Failed to update employee');
    res.status(500).json({ error: 'InternalServerError', message: error.message });
  }
}

export async function offboardEmployee(req: Request, res: Response): Promise<void> {
  const employeeId = Number(req.params.id);
  if (isNaN(employeeId)) {
    res.status(400).json({ error: 'ValidationError', message: 'Invalid employee ID parameter.' });
    return;
  }

  const parseResult = OffboardEmployeeSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({
      error: 'ValidationError',
      issues: parseResult.error.format(),
    });
    return;
  }

  try {
    const result = await employeeService.offboardEmployee(employeeId, parseResult.data, req.user?.hrUserId);
    res.status(200).json(result);
  } catch (err) {
    const error = err as Error;
    if (error.message.includes('not found')) {
      res.status(404).json({ error: 'NotFound', message: error.message });
      return;
    }
    if (error.message.includes('Cannot schedule') || error.message.includes('already exists')) {
      res.status(409).json({ error: 'Conflict', message: error.message });
      return;
    }
    logger.error({ message: error.message }, 'Failed to offboard employee');
    res.status(500).json({ error: 'InternalServerError', message: error.message });
  }
}
