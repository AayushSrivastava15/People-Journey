import type { Request, Response, NextFunction } from 'express';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

const allowedOrigins = env.CORS_ORIGIN.split(',')
  .map(o => o.trim())
  .filter(Boolean);

/**
 * Origin-based CSRF protection middleware for cookie-authenticated requests.
 *
 * For state-changing operations (POST, PUT, PATCH, DELETE) that carry the `pj_session`
 * cookie, this verifies that the browser's `Origin` or `Referer` header exactly matches
 * an authorized frontend origin. Cross-site forged requests will carry the attacker's
 * origin and are blocked with HTTP 403.
 *
 * Requests using `Authorization: Bearer <token>` are not vulnerable to simple cross-site
 * form submission CSRF and are allowed through.
 */
export function csrfProtection(req: Request, res: Response, next: NextFunction): void {
  // Safe methods do not mutate state
  if (SAFE_METHODS.has(req.method)) {
    next();
    return;
  }

  // Exempt webhooks with their own cryptographic HMAC signatures or public endpoints
  if (req.path.startsWith('/api/exit-interviews/webhook') || req.path.startsWith('/healthz')) {
    next();
    return;
  }

  // Only enforce origin check if the request is carrying the pj_session cookie
  const hasSessionCookie = Boolean(req.cookies?.pj_session);
  if (!hasSessionCookie) {
    next();
    return;
  }

  const originHeader = req.headers.origin;
  const refererHeader = req.headers.referer;

  let requestOrigin = originHeader;
  if (!requestOrigin && refererHeader) {
    try {
      const parsedUrl = new URL(refererHeader);
      requestOrigin = parsedUrl.origin;
    } catch {
      // Invalid referer URL format
    }
  }

  // If no Origin or Referer is supplied on a cookie-authenticated mutating request
  if (!requestOrigin) {
    // In development or non-browser tooling, allow if Sec-Fetch-Site is not cross-site
    if (env.NODE_ENV !== 'production') {
      next();
      return;
    }

    logger.warn(
      { path: req.path, method: req.method },
      'Blocked mutating cookie request: Missing Origin and Referer headers'
    );
    res.status(403).json({
      success: false,
      error: {
        code: 'CSRF_ORIGIN_MISSING',
        message: 'Cross-site request forgery protection: Origin header is required.',
      },
    });
    return;
  }

  // Validate requestOrigin against configured allowed origins
  const isExplicitlyAllowed = allowedOrigins.includes(requestOrigin);
  const isDevLocalhost =
    env.NODE_ENV !== 'production' &&
    /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(requestOrigin);

  if (!isExplicitlyAllowed && !isDevLocalhost) {
    logger.warn(
      { path: req.path, method: req.method, requestOrigin },
      'Blocked cross-origin CSRF attempt'
    );
    res.status(403).json({
      success: false,
      error: {
        code: 'CSRF_ORIGIN_INVALID',
        message: 'Cross-site request forgery protection: Untrusted request origin.',
      },
    });
    return;
  }

  next();
}
