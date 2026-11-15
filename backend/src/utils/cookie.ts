import { env } from '../config/env.js';

export const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000; // 604,800,000 milliseconds (7 days)

export interface SessionCookieOptions {
  httpOnly: boolean;
  secure: boolean;
  sameSite: 'none' | 'lax';
  path: string;
  maxAge?: number;
}

/**
 * Returns secure, production-hardened cookie options for the pj_session cookie.
 *
 * @param remember When true (the default "Remember this device" behavior), an explicit
 *                 7-day maxAge is set, instructing Chrome to persist the cookie across
 *                 browser restarts and computer reboots.
 *                 When false, maxAge is omitted, resulting in an in-memory browser session
 *                 cookie that Chrome automatically purges upon application exit.
 */
export function getSessionCookieOptions(remember = true): SessionCookieOptions {
  const isProd = env.NODE_ENV === 'production';
  const options: SessionCookieOptions = {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? 'none' : 'lax',
    path: '/',
  };

  if (remember) {
    options.maxAge = SEVEN_DAYS_MS;
  }

  return options;
}

/**
 * Returns matching cookie attributes required to clear the pj_session cookie cleanly.
 */
export function getClearSessionCookieOptions(): Omit<SessionCookieOptions, 'maxAge'> {
  const isProd = env.NODE_ENV === 'production';
  return {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? 'none' : 'lax',
    path: '/',
  };
}
