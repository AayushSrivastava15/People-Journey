import type { Request, Response } from 'express';
import { emailDraftService } from '../services/email-draft.service';
import {
  previewDraftSchema,
  createDraftSchema,
  updateDraftStatusSchema,
} from '../models/email-draft.model';

export async function previewDraft(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    const parseResult = previewDraftSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid draft preview payload',
          details: parseResult.error.flatten(),
        },
      });
      return;
    }

    const preview = await emailDraftService.previewDraft(userId, parseResult.data);
    res.json({
      success: true,
      data: preview,
    });
  } catch (err) {
    res.status(400).json({
      success: false,
      error: { code: 'PREVIEW_FAILED', message: (err as Error).message },
    });
  }
}

export async function createDraft(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    const parseResult = createDraftSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid draft creation payload',
          details: parseResult.error.flatten(),
        },
      });
      return;
    }

    const draft = await emailDraftService.createDraft(userId, parseResult.data);
    res.status(201).json({
      success: true,
      data: draft,
    });
  } catch (err) {
    res.status(400).json({
      success: false,
      error: { code: 'CREATE_FAILED', message: (err as Error).message },
    });
  }
}

export async function listDrafts(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    const page = req.query.page ? parseInt(req.query.page as string, 10) : 1;
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 10;
    const status = req.query.status as string | undefined;
    const search = req.query.search as string | undefined;

    const result = await emailDraftService.listDrafts(userId, {
      page,
      limit,
      status,
      search,
    });

    res.json({
      success: true,
      ...result,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: (err as Error).message },
    });
  }
}

export async function getDraftById(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    const draftId = String(req.params.id);
    const draft = await emailDraftService.getDraftById(userId, draftId);
    if (!draft) {
      res.status(404).json({ success: false, error: 'Draft not found' });
      return;
    }

    res.json({
      success: true,
      data: draft,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: (err as Error).message },
    });
  }
}

export async function updateDraftStatus(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    const parseResult = updateDraftStatusSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid draft status payload',
          details: parseResult.error.flatten(),
        },
      });
      return;
    }

    const draftId = String(req.params.id);
    const draft = await emailDraftService.updateDraftStatus(
      userId,
      draftId,
      parseResult.data.status,
      parseResult.data.gmailOpened
    );

    res.json({
      success: true,
      data: draft,
    });
  } catch (err) {
    res.status(400).json({
      success: false,
      error: { code: 'STATUS_UPDATE_FAILED', message: (err as Error).message },
    });
  }
}
