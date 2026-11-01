import type { Request, Response } from 'express';
import { dashboardService } from '../services/dashboard.service.js';
import { logger } from '../utils/logger.js';

/**
 * Retrieve personal dashboard metrics for the authenticated user.
 */
export async function getPersonalDashboard(req: Request, res: Response): Promise<void> {
  const user = req.user;
  if (!user) {
    res.status(401).json({
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: 'Authentication required.',
      },
    });
    return;
  }

  try {
    const data = await dashboardService.getPersonalDashboard(user.id, user.email);
    res.status(200).json({
      success: true,
      data,
    });
  } catch (err) {
    const error = err as Error;
    logger.error({ message: error.message }, 'Failed to load personal dashboard');
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: error.message,
      },
    });
  }
}

/**
 * Retrieve personal HR workspace statistics.
 * Scoped to the authenticated user's workspace.
 */
export async function getDashboardStats(req: Request, res: Response): Promise<void> {
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

  try {
    const stats = await dashboardService.getStats(userId);
    res.status(200).json(stats);
  } catch (err) {
    const error = err as Error;
    logger.error({ message: error.message }, 'Failed to compute dashboard stats');
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: error.message,
      },
    });
  }
}

