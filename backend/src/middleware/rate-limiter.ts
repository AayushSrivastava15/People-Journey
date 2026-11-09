import type { Request, Response, NextFunction } from 'express';
import rateLimit, { type Options, type RateLimitRequestHandler } from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';
import { Redis, type Redis as RedisClient } from 'ioredis';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { getFirebaseAuth } from '../config/firebase.js';
import { authCache } from '../utils/auth-cache.js';
import { userService } from '../services/user.service.js';

let redisClient: RedisClient | null = null;
let isRedisAvailable = false;

/**
 * Initializes and retrieves the singleton Redis client if REDIS_URL is configured.
 * Implements non-blocking connection with graceful fallback to in-memory store.
 */
export function getRedisClient(): RedisClient | null {
  if (redisClient) {
    return isRedisAvailable ? redisClient : null;
  }

  if (!env.REDIS_URL || env.REDIS_URL.trim() === '') {
    return null;
  }

  try {
    redisClient = new Redis(env.REDIS_URL, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      connectTimeout: 3000,
      retryStrategy: (times: number) => {
        if (times > 3) {
          logger.warn({ attempt: times }, 'Max Redis reconnection attempts reached. Continuing with in-memory store.');
          isRedisAvailable = false;
          return null; // Stop retrying automatically
        }
        return Math.min(times * 1000, 3000);
      },
    });

    redisClient.on('connect', () => {
      isRedisAvailable = true;
      logger.info('Connected to Redis for distributed rate limiting and caching.');
    });

    redisClient.on('error', (err: Error) => {
      isRedisAvailable = false;
      logger.warn(
        { message: err.message },
        'Redis connection error in rate limiter. Gracefully falling back to in-memory store.'
      );
    });

    // Initiate connection asynchronously
    redisClient.connect().catch((err: Error) => {
      isRedisAvailable = false;
      logger.warn(
        { message: err.message },
        'Initial Redis connection attempt failed. Utilizing in-memory store fallback.'
      );
    });

    return redisClient;
  } catch (err) {
    logger.warn({ message: (err as Error).message }, 'Failed to initialize Redis client. Using in-memory fallback.');
    return null;
  }
}

/**
 * Gracefully terminates the Redis connection during application shutdown.
 */
export async function closeRedisClient(): Promise<void> {
  if (redisClient) {
    try {
      await redisClient.quit();
      logger.info('Redis connection closed.');
    } catch {
      redisClient.disconnect();
    } finally {
      redisClient = null;
      isRedisAvailable = false;
    }
  }
}

/**
 * Masks IP address to protect end-user privacy in compliance with logging requirements.
 */
function maskIp(ip?: string): string {
  if (!ip) return 'unknown';
  if (ip.includes('.')) {
    const parts = ip.split('.');
    return `${parts[0]}.${parts[1] || '*'}.***.***`;
  }
  if (ip.includes(':')) {
    const parts = ip.split(':');
    return `${parts[0]}:${parts[1] || '*'}:****:****`;
  }
  return 'masked';
}

/**
 * Safely generates rate limit key from verified server-side credentials or client IP.
 * Never trusts client-supplied headers or request body identifiers.
 */
export function getRateLimitKey(req: Request, type: 'user' | 'ip' | 'auto' = 'auto'): string {
  if (type === 'ip') {
    return `ip:${req.ip || '127.0.0.1'}`;
  }

  // Verified server-side user ID attached by authenticateToken or resolveOptionalAuth
  const verifiedUserId = req.user?.id || req.firebaseUser?.uid;
  if (verifiedUserId) {
    return `user:${verifiedUserId}`;
  }

  // Fallback to safely extracted client IP (respecting Express trust proxy)
  return `ip:${req.ip || '127.0.0.1'}`;
}

export interface LimiterConfig {
  category: string;
  windowMs: number;
  max: number;
  type?: 'user' | 'ip' | 'auto';
  message?: string;
  skipFailedRequests?: boolean;
}

/**
 * Factory for creating production-ready Express rate limiters with:
 * - Redis-backed distributed storage when available
 * - Automatic in-memory fallback if Redis is unavailable or unconfigured
 * - Verified server-side user quota isolation
 * - Standard draft-7 RateLimit headers and Retry-After
 * - Privacy-safe structured Pino logging
 */
export function createRateLimiter(config: LimiterConfig): RateLimitRequestHandler {
  const { category, windowMs, max, type = 'auto', message, skipFailedRequests = false } = config;
  const client = getRedisClient();

  // Create RedisStore if Redis is connected and responsive
  let store: any = undefined;
  if (client && isRedisAvailable) {
    try {
      store = new RedisStore({
        sendCommand: (...args: string[]) => client.call(args[0], ...args.slice(1)) as any,
        prefix: `pj:rl:${category}:`,
      });
    } catch (err) {
      logger.warn(
        { message: (err as Error).message, category },
        'Failed to bind RedisStore for rate limiter; using in-memory store.'
      );
    }
  }

  return rateLimit({
    windowMs,
    max,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    skipFailedRequests,
    store,
    keyGenerator: (req: Request) => getRateLimitKey(req, type),
    skip: (req: Request) => {
      // Always allow CORS preflight checks without quota consumption
      if (req.method === 'OPTIONS') return true;
      return false;
    },
    handler: (req: Request, res: Response, _next: NextFunction, options: Options) => {
      const retryAfterSeconds = Math.ceil(options.windowMs / 1000);
      res.setHeader('Retry-After', String(retryAfterSeconds));

      const isUser = Boolean(req.user?.id || req.firebaseUser?.uid);
      const safeIdentifier = isUser
        ? `user:${(req.user?.id || req.firebaseUser?.uid || '').slice(0, 8)}...`
        : `ip:${maskIp(req.ip)}`;

      // Structured Pino rate-limit log (never logs tokens, passwords, or PII)
      logger.warn(
        {
          event: 'RATE_LIMIT_TRIGGERED',
          category,
          requestId: (req as any).id || req.headers['x-request-id'] || req.headers['x-correlation-id'],
          route: req.originalUrl || req.url,
          method: req.method,
          identifier: safeIdentifier,
          quotaLimit: max,
          remaining: 0,
          retryAfterSeconds,
        },
        `Rate limit exceeded for category: ${category}`
      );

      res.status(429).json({
        success: false,
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message:
            message ||
            `Too many requests for ${category}. Please slow down and try again in ${retryAfterSeconds} seconds.`,
          category,
          retryAfter: retryAfterSeconds,
        },
      });
    },
  });
}

/**
 * Optional authentication pre-resolver for the general API rate limiter.
 * If a valid Bearer token is present, resolves the verified user into req.user
 * without rejecting unauthenticated requests.
 */
export async function resolveOptionalAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next();
  }

  const token = authHeader.slice(7).trim();
  if (!token) {
    return next();
  }

  try {
    const auth = getFirebaseAuth();
    const decodedToken = await auth.verifyIdToken(token);
    req.firebaseUser = {
      uid: decodedToken.uid,
      email: decodedToken.email,
      name: decodedToken.name,
      picture: decodedToken.picture,
    };

    // Check fast in-memory auth cache first
    const cachedUser = authCache.get(decodedToken.uid);
    if (cachedUser) {
      req.user = cachedUser;
      req.appUser = cachedUser;
      return next();
    }

    // Resolve from database
    const user = await userService.findByFirebaseUid(decodedToken.uid);
    if (user && user.accountStatus === 'active') {
      authCache.set(decodedToken.uid, user);
      req.user = user;
      req.appUser = user;
    }
  } catch {
    // Silently continue as unauthenticated for the rate limiter.
    // The downstream authenticateToken middleware will handle rejection if required.
  }

  next();
}

// ----------------------------------------------------------------------
// Preconfigured Limiters (per user requirements)
// ----------------------------------------------------------------------

/**
 * A. General API Limiter: 120 req / min per authenticated user (or IP fallback).
 * Applied to all /api routes.
 */
export const generalApiLimiter = createRateLimiter({
  category: 'general_api',
  windowMs: env.RATE_LIMIT_GENERAL_WINDOW_MS,
  max: env.RATE_LIMIT_GENERAL_MAX,
  type: 'auto',
  message: 'API rate limit exceeded. Please slow down and retry in a moment.',
});

/**
 * B. Authentication Limiter: 10 req / 15 min per client IP.
 * Protects login and auth verification endpoints against brute-force attacks.
 */
export const authLimiter = createRateLimiter({
  category: 'authentication',
  windowMs: env.RATE_LIMIT_AUTH_WINDOW_MS,
  max: env.RATE_LIMIT_AUTH_MAX,
  type: 'ip',
  message: 'Too many authentication attempts from this IP address. Please wait 15 minutes before retrying.',
});

/**
 * C. Dashboard Limiter: 30 req / min per authenticated user.
 * Protects KPI calculations and aggregate queries against polling loops.
 */
export const dashboardLimiter = createRateLimiter({
  category: 'dashboard',
  windowMs: env.RATE_LIMIT_DASHBOARD_WINDOW_MS,
  max: env.RATE_LIMIT_DASHBOARD_MAX,
  type: 'user',
  message: 'Dashboard request limit reached (30/min). Data is cached to preserve database performance.',
});

/**
 * D. Employee Management Limiter: 30 req / min per authenticated user.
 * Protects CRUD operations, listing pagination, and filters.
 */
export const employeeLimiter = createRateLimiter({
  category: 'employee_management',
  windowMs: env.RATE_LIMIT_EMPLOYEE_WINDOW_MS,
  max: env.RATE_LIMIT_EMPLOYEE_MAX,
  type: 'user',
  message: 'Employee management request limit reached (30/min). Please slow down your requests.',
});

/**
 * E. Email Limiter: 5 email-send/preview operations per minute per authenticated user.
 * Protects against accidental bulk email sending or spamming candidate emails.
 */
export const emailLimiter = createRateLimiter({
  category: 'email_service',
  windowMs: env.RATE_LIMIT_EMAIL_WINDOW_MS,
  max: env.RATE_LIMIT_EMAIL_MAX,
  type: 'user',
  message: 'Email operation limit reached (5/min). Please wait a moment before sending more emails.',
});

/**
 * F. Public Exit Interview Limiter: 20 req / min per client IP.
 * Protects public short-link resolution and feedback submissions from automated abuse.
 */
export const publicExitLimiter = createRateLimiter({
  category: 'public_exit_interview',
  windowMs: env.RATE_LIMIT_PUBLIC_EXIT_WINDOW_MS,
  max: env.RATE_LIMIT_PUBLIC_EXIT_MAX,
  type: 'ip',
  message: 'Too many feedback requests from your network. Please wait a minute before trying again.',
});

/**
 * G. Export Limiter: 5 export operations per minute per authenticated user.
 * Protects server CPU and memory during large CSV/Excel generation.
 */
export const exportLimiter = createRateLimiter({
  category: 'export_service',
  windowMs: env.RATE_LIMIT_EXPORT_WINDOW_MS,
  max: env.RATE_LIMIT_EXPORT_MAX,
  type: 'user',
  message: 'Export limit reached (5/min). Please wait before downloading additional reports.',
});
