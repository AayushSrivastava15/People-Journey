import type { Request, Response } from 'express';
import { userService } from '../services/user.service';
import { CreateHrUserSchema, UpdateHrUserSchema } from '../models/user.model';
import { logger } from '../utils/logger';

/**
 * Endpoint to verify authenticated session and return trusted HR user claims from Oracle.
 */
export async function verifyAuth(req: Request, res: Response): Promise<void> {
  const user = req.user;

  if (!user) {
    res.status(401).json({
      authorized: false,
      message: 'Unauthenticated user.',
    });
    return;
  }

  res.status(200).json({
    authorized: true,
    hrUserId: user.hrUserId,
    uid: user.firebaseUid,
    email: user.email,
    name: user.fullName,
    role: user.role,
    isActive: user.isActive,
    picture: req.firebaseUser?.picture || null,
  });
}

/**
 * List all HR workspace users (Admin only).
 */
export async function listHrUsers(_req: Request, res: Response): Promise<void> {
  try {
    const users = await userService.findAll();
    res.status(200).json(users);
  } catch (err) {
    const error = err as Error;
    logger.error({ message: error.message }, 'Failed to list HR users');
    res.status(500).json({ error: 'InternalServerError', message: error.message });
  }
}

/**
 * Provision a new HR user (Admin only).
 */
export async function createHrUser(req: Request, res: Response): Promise<void> {
  const parseResult = CreateHrUserSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({
      error: 'ValidationError',
      issues: parseResult.error.format(),
    });
    return;
  }

  try {
    const existing = await userService.findByEmail(parseResult.data.email);
    if (existing) {
      res.status(409).json({
        error: 'Conflict',
        message: `An HR user with email ${parseResult.data.email} already exists.`,
      });
      return;
    }

    const created = await userService.create(parseResult.data);
    res.status(201).json(created);
  } catch (err) {
    const error = err as Error;
    logger.error({ message: error.message }, 'Failed to create HR user');
    res.status(500).json({ error: 'InternalServerError', message: error.message });
  }
}

/**
 * Update an HR user's role or active status (Admin only).
 */
export async function updateHrUser(req: Request, res: Response): Promise<void> {
  const userId = Number(req.params.id);
  if (isNaN(userId)) {
    res.status(400).json({ error: 'ValidationError', message: 'Invalid HR user ID parameter.' });
    return;
  }

  const parseResult = UpdateHrUserSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({
      error: 'ValidationError',
      issues: parseResult.error.format(),
    });
    return;
  }

  try {
    const updated = await userService.update(userId, parseResult.data);
    res.status(200).json(updated);
  } catch (err) {
    const error = err as Error;
    logger.error({ message: error.message }, 'Failed to update HR user');
    res.status(500).json({ error: 'InternalServerError', message: error.message });
  }
}
