import type { Request, Response } from 'express';
import { dashboardService } from '../services/dashboard.service';
import { logger } from '../utils/logger';

export async function getDashboardStats(_req: Request, res: Response): Promise<void> {
  try {
    const stats = await dashboardService.getStats();
    res.status(200).json(stats);
  } catch (err) {
    const error = err as Error;
    logger.error({ message: error.message }, 'Failed to compute dashboard stats');
    res.status(500).json({ error: 'InternalServerError', message: error.message });
  }
}
