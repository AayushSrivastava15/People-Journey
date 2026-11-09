import express, { type Express } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { requestLogger } from './middleware/request-logger.js';
import { errorHandler } from './middleware/error-handler.js';
import {
  generalApiLimiter,
  publicExitLimiter,
  resolveOptionalAuth,
} from './middleware/rate-limiter.js';
import routes from './routes/index.js';
import { env } from './config/env.js';
import { getHealth } from './controllers/health.controller.js';
import { resolveShortLink } from './controllers/exit-interview.controller.js';

const app: Express = express();

// 1. Reverse Proxy Trust Configuration (Render / Cloudflare)
// Essential for accurate client IP identification in rate limiting without header spoofing
app.set('trust proxy', Number(env.TRUST_PROXY) || (env.TRUST_PROXY === 'true' ? true : 1));

// 2. HTTP Security Headers (prevents clickjacking, MIME sniffing, XSS injection)
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  })
);

app.use(requestLogger);

// 3. CORS Configuration
const allowedOrigins = env.CORS_ORIGIN.split(',').map(origin => origin.trim()).filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (curl, mobile apps, health probes)
      if (!origin) return callback(null, true);
      // Explicitly configured origins
      if (allowedOrigins.includes(origin)) return callback(null, true);
      // In development, allow localhost on any port
      if (env.NODE_ENV !== 'production' && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
        return callback(null, true);
      }
      callback(null, false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'x-request-id', 'x-correlation-id'],
    exposedHeaders: ['x-request-id', 'RateLimit-Limit', 'RateLimit-Remaining', 'RateLimit-Reset', 'Retry-After'],
  })
);

app.use(cookieParser());

// 4. Root Health Probe Aliases (Render, Kubernetes, cloud monitors)
// Mounted BEFORE rate limiting so automated probes are NEVER throttled or locked out
app.get(['/healthz', '/health'], getHealth);

// 5. Request Payload Size Limits (supports high-res company logo uploads)
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// 6. Short URL direct resolver for departing employees (protected by public exit rate limiter)
app.get('/e/:code', publicExitLimiter, (req, res, next) => {
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

// 7. Security Headers for API responses (Prevent CDN / Shared Browser Caching of Multi-Tenant HR Data)
app.use('/api', (_req, res, next) => {
  res.setHeader('Cache-Control', 'private, no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  next();
});

// 8. General API Rate Limiting (120 req/min per verified user or client IP)
// Pre-resolves optional Bearer credentials so verified users receive dedicated user quotas
app.use('/api', resolveOptionalAuth, generalApiLimiter, routes);

app.use(errorHandler);

export default app;
