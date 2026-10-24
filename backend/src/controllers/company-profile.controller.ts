import type { Request, Response } from 'express';
import { companyProfileService } from '../services/company-profile.service';
import { upsertCompanyProfileSchema } from '../models/company-profile.model';

export async function getCompanyProfile(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    const profile = await companyProfileService.getProfile(userId);
    res.json({
      success: true,
      data: profile,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: (err as Error).message },
    });
  }
}

export async function updateCompanyProfile(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    const parseResult = upsertCompanyProfileSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid company profile payload',
          details: parseResult.error.flatten(),
        },
      });
      return;
    }

    const profile = await companyProfileService.upsertProfile(userId, parseResult.data);
    res.json({
      success: true,
      message: 'Company profile saved successfully',
      data: profile,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: (err as Error).message },
    });
  }
}
