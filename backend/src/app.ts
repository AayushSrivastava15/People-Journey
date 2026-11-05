import express, { type Express } from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { requestLogger } from './middleware/request-logger.js';
import { errorHandler } from './middleware/error-handler.js';
import routes from './routes/index.js';
import { env } from './config/env.js';

import { resolveShortLink } from './controllers/exit-interview.controller.js';

const app: Express = express();

// 1. HTTP Security Headers (prevents clickjacking, MIME sniffing, XSS injection)
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  })
);

// 2. Global Rate Limiter (protects against DDoS, brute force, and API scraping)
const apiRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15-minute window
  max: 500, // 500 requests per IP per window
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: {
    success: false,
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many requests from this IP address. Please slow down and try again shortly.',
    },
  },
});

app.use(apiRateLimiter);
app.use(requestLogger);

// 3. CORS Configuration
app.use(
  cors({
    origin: env.CORS_ORIGIN.split(',').map(origin => origin.trim()).filter(Boolean),
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  })
);

app.use(cookieParser());

// 4. Request Payload Size Limits (prevents memory exhaustion attacks)
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// Short URL direct resolver for departing employees (redirects browser hits to frontend hosted form)
app.get('/e/:code', (req, res, next) => {
  const code = encodeURIComponent(String(req.params.code || '').trim());
  if (req.accepts(['html', 'json']) === 'html' || !req.headers.accept?.includes('application/json')) {
    const frontendBase = (
      env.FRONTEND_URL ||
      (env.NODE_ENV === 'production' ? 'https://people-journey-frontend.onrender.com' : 'http://localhost:3000')
    ).split(',')[0].trim().replace(/\/$/, '');
    return res.redirect(302, `${frontendBase}/e/${code}`);
  }
  return resolveShortLink(req, res);
});

app.use('/api', routes);

app.use(errorHandler);

export default app;
