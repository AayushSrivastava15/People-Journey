import type { Request, Response } from 'express';
import { healthService } from '../services/health.service';

export async function getHealth(_req: Request, res: Response): Promise<void> {
  const result = await healthService.check();
  const statusCode = result.status === 'ok' ? 200 : result.status === 'degraded' ? 200 : 503;
  res.status(statusCode).json(result);
}
