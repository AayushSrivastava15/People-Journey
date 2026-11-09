import pino from 'pino';
import { env } from '../config/env.js';

const isProduction = env.NODE_ENV === 'production';

export const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  timestamp: pino.stdTimeFunctions.isoTime,
  base: {
    env: isProduction ? 'production' : (process.env.NODE_ENV || 'development'),
  },
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'req.headers["x-api-key"]',
      'req.headers["authorization"]',
      "res.headers['set-cookie']",
      'password',
      '*.password',
      'token',
      '*.token',
      'secret',
      '*.secret',
      'personalEmail',
      '*.personalEmail',
      'personal_email',
      '*.personal_email',
      'phone',
      '*.phone',
      'credentials',
      '*.credentials',
    ],
    censor: '[REDACTED]',
  },
  ...(isProduction
    ? {}
    : {
        transport: {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'SYS:yyyy-mm-dd HH:MM:ss.l',
            ignore: 'pid,hostname',
          },
        },
      }),
});
