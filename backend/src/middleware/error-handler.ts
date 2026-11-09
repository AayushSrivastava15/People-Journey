import type { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger.js';
import { env } from '../config/env.js';

interface HttpError extends Error {
  statusCode?: number;
  status?: number;
  code?: string;
}

export function errorHandler(
  err: HttpError,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  const isProduction = env.NODE_ENV === 'production';
  const statusCode = Number(err.statusCode || err.status) || 500;
  const requestId = (req as { id?: string | number }).id || req.headers['x-request-id'] || undefined;

  if (statusCode >= 500) {
    logger.error(
      {
        err: {
          name: err.name,
          message: err.message,
          stack: isProduction ? undefined : err.stack,
        },
        requestId,
        method: req.method,
        url: req.originalUrl || req.url,
        statusCode,
      },
      'Unhandled internal server error'
    );
  } else {
    logger.warn(
      {
        requestId,
        method: req.method,
        url: req.originalUrl || req.url,
        statusCode,
        message: err.message,
      },
      'Client request error'
    );
  }

  // Consistent API error response without leaking stack traces or internal DB info
  const clientMessage = isProduction && statusCode >= 500
    ? 'An unexpected error occurred. Please try again later.'
    : err.message || 'Internal Server Error';

  res.status(statusCode).json({
    success: false,
    error: {
      code: err.code || (statusCode >= 500 ? 'INTERNAL_SERVER_ERROR' : 'BAD_REQUEST'),
      message: clientMessage,
    },
    message: clientMessage,
    ...(requestId ? { requestId } : {}),
  });
}
