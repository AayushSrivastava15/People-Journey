import type { Request, Response } from 'express';
import { emailTemplateService } from '../services/email-template.service';
import {
  createEmailTemplateSchema,
  updateEmailTemplateSchema,
} from '../models/email-template.model';

export async function listTemplates(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    const { category, search } = req.query;
    const templates = await emailTemplateService.listTemplates(
      userId,
      category as string | undefined,
      search as string | undefined
    );

    res.json({
      success: true,
      data: templates,
      total: templates.length,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: (err as Error).message },
    });
  }
}

export async function getTemplateById(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    const templateId = String(req.params.id);
    const template = await emailTemplateService.getTemplateById(userId, templateId);
    if (!template) {
      res.status(404).json({ success: false, error: 'Template not found' });
      return;
    }

    res.json({
      success: true,
      data: template,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: (err as Error).message },
    });
  }
}

export async function createTemplate(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    const parseResult = createEmailTemplateSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid template payload',
          details: parseResult.error.flatten(),
        },
      });
      return;
    }

    const template = await emailTemplateService.createTemplate(userId, parseResult.data);
    res.status(201).json({
      success: true,
      data: template,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: (err as Error).message },
    });
  }
}

export async function updateTemplate(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    const parseResult = updateEmailTemplateSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid template update payload',
          details: parseResult.error.flatten(),
        },
      });
      return;
    }

    const templateId = String(req.params.id);
    const template = await emailTemplateService.updateTemplate(
      userId,
      templateId,
      parseResult.data
    );

    res.json({
      success: true,
      data: template,
    });
  } catch (err) {
    const message = (err as Error).message;
    const status = message.includes('Unauthorized') ? 403 : message.includes('not found') ? 404 : 400;
    res.status(status).json({
      success: false,
      error: { code: 'OPERATION_FAILED', message },
    });
  }
}

export async function duplicateTemplate(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    const templateId = String(req.params.id);
    const duplicate = await emailTemplateService.duplicateTemplate(userId, templateId);
    res.status(201).json({
      success: true,
      data: duplicate,
      message: 'Template duplicated to your workspace',
    });
  } catch (err) {
    res.status(400).json({
      success: false,
      error: { code: 'DUPLICATE_FAILED', message: (err as Error).message },
    });
  }
}

export async function deleteTemplate(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    const templateId = String(req.params.id);
    const deleted = await emailTemplateService.deleteTemplate(userId, templateId);
    if (!deleted) {
      res.status(404).json({ success: false, error: 'Template not found' });
      return;
    }

    res.json({
      success: true,
      message: 'Template deleted from your workspace',
    });
  } catch (err) {
    const message = (err as Error).message;
    const status = message.includes('Unauthorized') ? 403 : 400;
    res.status(status).json({
      success: false,
      error: { code: 'DELETE_FAILED', message },
    });
  }
}
