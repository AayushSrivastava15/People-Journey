import pinoHttp from 'pino-http';
import { logger } from '../utils/logger';

// Support both ESM default and CJS imports for pino-http
const pinoHttpFn = typeof pinoHttp === 'function' ? pinoHttp : (pinoHttp as unknown as { default: typeof pinoHttp }).default;

export const requestLogger = pinoHttpFn({
  logger,
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
