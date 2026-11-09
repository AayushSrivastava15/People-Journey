import express, { type Express } from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { requestLogger } from './middleware/request-logger.js';
import { errorHandler } from './middleware/error-handler.js';
import routes from './routes/index.js';
import { env } from './config/env.js';
import { getHealth } from './controllers/health.controller.js';
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
    exposedHeaders: ['x-request-id'],
  })
);

app.use(cookieParser());

// Root health-check probe aliases (Render, Kubernetes, cloud load-balancers)
app.get(['/healthz', '/health'], getHealth);

// 4. Request Payload Size Limits (supports high-res company logo uploads)
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

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
