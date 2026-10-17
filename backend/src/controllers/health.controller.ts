import type { Request, Response } from 'express';
import { healthService } from '../services/health.service';

export function getHealth(_req: Request, res: Response): void {
  const result = healthService.check();
  res.json(result);
}
