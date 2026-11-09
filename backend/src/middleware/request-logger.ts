import { pinoHttp } from 'pino-http';
import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { logger } from '../utils/logger.js';

export const requestLogger = pinoHttp({
  logger,
  genReqId(req: IncomingMessage, res: ServerResponse) {
    const existing = req.headers['x-request-id'] || req.headers['x-correlation-id'];
    const id = (Array.isArray(existing) ? existing[0] : existing) || randomUUID();
    res.setHeader('x-request-id', id);
    return id;
  },
  customLogLevel(_req: IncomingMessage, res: ServerResponse, err?: Error) {
    if (res.statusCode >= 500 || err) return 'error';
    if (res.statusCode >= 400) return 'warn';
    return 'info';
  },
  customSuccessMessage(req: IncomingMessage, res: ServerResponse, responseTime: number) {
    const cleanUrl = (req.url || '').split('?')[0].replace(/(\/api\/exit-interviews\/public\/)\w{64}/i, '$1[redacted]');
    return `${req.method || 'GET'} ${cleanUrl} ${res.statusCode} (${Math.round(responseTime)}ms)`;
  },
  customErrorMessage(req: IncomingMessage, res: ServerResponse, err: Error) {
    const cleanUrl = (req.url || '').split('?')[0].replace(/(\/api\/exit-interviews\/public\/)\w{64}/i, '$1[redacted]');
    return `${req.method || 'GET'} ${cleanUrl} failed with status ${res.statusCode}: ${err.message}`;
  },
  serializers: {
    req(req: { id?: string | number; method?: string; url?: string }) {
      return {
        id: req.id,
        method: req.method,
        // Public exit-interview tokens are path parameters and must never enter logs.
        url: req.url?.split('?')[0].replace(/(\/api\/exit-interviews\/public\/)\w{64}/i, '$1[redacted]'),
      };
    },
    res(res: { statusCode?: number }) {
      return {
        statusCode: res.statusCode,
      };
    },
  },
});
