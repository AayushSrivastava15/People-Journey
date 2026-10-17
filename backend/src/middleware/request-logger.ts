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
        url: req.url?.split('?')[0],
      };
    },
    res(res: { statusCode?: number }) {
      return {
        statusCode: res.statusCode,
      };
    },
  },
});
