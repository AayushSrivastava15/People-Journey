import type { Request, Response } from 'express';
import { notificationService } from '../services/notification.service.js';
import { logger } from '../utils/logger.js';

export async function getNotifications(req: Request, res: Response): Promise<void> {
  const userId = req.user?.id;
  if (!userId) {
    res.status(401).json({
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Authentication required.' },
    });
    return;
  }

  const limit = Math.min(Math.max(parseInt(String(req.query.limit || '10'), 10) || 10, 1), 50);

  try {
    const data = await notificationService.getNotifications(userId, limit);
    res.status(200).json({
      success: true,
      data,
    });
  } catch (err) {
    const error = err as Error;
    logger.error({ message: error.message }, 'Failed to fetch user notifications');
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_SERVER_ERROR', message: error.message },
    });
  }
}

export async function markAsRead(req: Request, res: Response): Promise<void> {
  const userId = req.user?.id;
  if (!userId) {
    res.status(401).json({
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Authentication required.' },
    });
    return;
  }

  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id) || id <= 0) {
    res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'Valid notification ID required.' },
    });
    return;
  }

  try {
    const updated = await notificationService.markAsRead(userId, id);
    if (!updated) {
      res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Notification not found or unauthorized.' },
      });
      return;
    }

    res.status(200).json({
      success: true,
      message: 'Notification marked as read.',
    });
  } catch (err) {
    const error = err as Error;
    logger.error({ message: error.message }, 'Failed to mark notification as read');
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_SERVER_ERROR', message: error.message },
    });
  }
}

export async function markAllAsRead(req: Request, res: Response): Promise<void> {
  const userId = req.user?.id;
  if (!userId) {
    res.status(401).json({
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Authentication required.' },
    });
    return;
  }

  try {
    const count = await notificationService.markAllAsRead(userId);
    res.status(200).json({
      success: true,
      message: `${count} notifications marked as read.`,
      updatedCount: count,
    });
  } catch (err) {
    const error = err as Error;
    logger.error({ message: error.message }, 'Failed to mark all notifications as read');
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_SERVER_ERROR', message: error.message },
    });
  }
}

