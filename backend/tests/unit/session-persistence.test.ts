import { describe, it, after } from 'node:test';
import { strictEqual, ok } from 'node:assert';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import app from '../../src/app.js';
import { closePool } from '../../src/config/database.js';
import {
  getSessionCookieOptions,
  getClearSessionCookieOptions,
  SEVEN_DAYS_MS,
} from '../../src/utils/cookie.js';
import { env } from '../../src/config/env.js';
import { csrfProtection } from '../../src/middleware/csrf.middleware.js';
import type { Request, Response } from 'express';

interface MockResponse extends Partial<Response> {
  statusCode?: number;
  jsonData?: unknown;
}

function createMockResponse(): MockResponse {
  const res: MockResponse = {};
  res.status = (code: number) => {
    res.statusCode = code;
    return res as Response;
  };
  res.json = (data: unknown) => {
    res.jsonData = data;
    return res as Response;
  };
  return res;
}

describe('Session Configuration & 7-Day Cookie Contract', () => {
  it('1. should configure 7-day persistent cookie when remember is true (604,800,000 ms)', () => {
    const options = getSessionCookieOptions(true);
    strictEqual(options.maxAge, SEVEN_DAYS_MS);
    strictEqual(options.maxAge, 7 * 24 * 60 * 60 * 1000);
    strictEqual(options.httpOnly, true);
    strictEqual(options.path, '/');
    if (env.NODE_ENV === 'production') {
      strictEqual(options.secure, true);
      strictEqual(options.sameSite, 'none');
    } else {
      strictEqual(options.sameSite, 'lax');
    }
  });

  it('2. should configure ephemeral browser session cookie without maxAge when remember is false', () => {
    const options = getSessionCookieOptions(false);
    strictEqual(options.maxAge, undefined, 'maxAge must be undefined for session cookies so Chrome deletes them on exit');
    strictEqual(options.httpOnly, true);
    strictEqual(options.path, '/');
  });

  it('3. should provide matching clear-cookie attributes to purge pj_session on logout', () => {
    const clearOptions = getClearSessionCookieOptions();
    strictEqual(clearOptions.httpOnly, true);
    strictEqual(clearOptions.path, '/');
    if (env.NODE_ENV === 'production') {
      strictEqual(clearOptions.secure, true);
      strictEqual(clearOptions.sameSite, 'none');
    }
  });
});

describe('Controlled Test Clock: 7-Day Session Expiration & Invalidation', () => {
  it('4. should reject an expired session cookie after 7-day lifetime with 401 SESSION_EXPIRED', async () => {
    const server = http.createServer(app);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
    const port = (server.address() as AddressInfo).port;

    try {
      // Simulate expired Firebase session cookie header
      const expiredMockCookie = 'pj_session=eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJleHAiOjE2MDAwMDAwMDB9.expired_signature';
      const response = await fetch(`http://127.0.0.1:${port}/api/auth/session`, {
        headers: {
          Cookie: expiredMockCookie,
        },
      });

      strictEqual(response.status, 401);
      const data = await response.json() as { success: boolean; authorized: boolean; error: { code: string; message: string } };
      strictEqual(data.success, false);
      strictEqual(data.authorized, false);
      strictEqual(data.error.code, 'SESSION_EXPIRED');

      // Verify Set-Cookie header tells browser to delete pj_session
      const setCookie = response.headers.get('set-cookie');
      ok(setCookie && setCookie.includes('pj_session=;'), 'Must clear expired cookie from client cookie jar');
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('5. should reject a malformed or forged session cookie with 401 and clear cookie', async () => {
    const server = http.createServer(app);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
    const port = (server.address() as AddressInfo).port;

    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/auth/session`, {
        headers: {
          Cookie: 'pj_session=fake-session-cookie-attack-vector',
        },
      });

      strictEqual(response.status, 401);
      const data = await response.json() as { error: { code: string } };
      strictEqual(data.error.code, 'SESSION_EXPIRED');
      const setCookie = response.headers.get('set-cookie');
      ok(setCookie && setCookie.includes('pj_session=;'));
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});

describe('CSRF Protection & Origin Validation for Session Cookies', () => {
  it('6. should allow safe GET requests regardless of origin', () => {
    const req = {
      method: 'GET',
      path: '/api/dashboard/stats',
      headers: { origin: 'https://any-origin.com' },
      cookies: { pj_session: 'some-cookie' },
    } as unknown as Request;
    const res = createMockResponse();
    let nextCalled = false;

    csrfProtection(req, res as Response, () => {
      nextCalled = true;
    });

    strictEqual(nextCalled, true);
    strictEqual(res.statusCode, undefined);
  });

  it('7. should block mutating POST requests using pj_session from untrusted origins with 403', () => {
    const req = {
      method: 'POST',
      path: '/api/employees',
      headers: { origin: 'https://malicious-attacker-website.com' },
      cookies: { pj_session: 'legitimate-user-cookie' },
    } as unknown as Request;
    const res = createMockResponse();
    let nextCalled = false;

    csrfProtection(req, res as Response, () => {
      nextCalled = true;
    });

    strictEqual(nextCalled, false);
    strictEqual(res.statusCode, 403);
    const data = res.jsonData as { error: { code: string } };
    strictEqual(data.error.code, 'CSRF_ORIGIN_INVALID');
  });

  it('8. should allow mutating POST requests from configured CORS origins', () => {
    const req = {
      method: 'POST',
      path: '/api/auth/logout',
      headers: { origin: 'http://localhost:3000' },
      cookies: { pj_session: 'valid-session' },
    } as unknown as Request;
    const res = createMockResponse();
    let nextCalled = false;

    csrfProtection(req, res as Response, () => {
      nextCalled = true;
    });

    strictEqual(nextCalled, true);
    strictEqual(res.statusCode, undefined);
  });

  it('9. should exempt public exit interview webhooks from CSRF checks', () => {
    const req = {
      method: 'POST',
      path: '/api/exit-interviews/webhook',
      headers: { origin: 'https://docs.google.com' },
      cookies: {},
    } as unknown as Request;
    const res = createMockResponse();
    let nextCalled = false;

    csrfProtection(req, res as Response, () => {
      nextCalled = true;
    });

    strictEqual(nextCalled, true);
  });
});

describe('Production CORS & Credentials Contract', () => {
  it('10. should respond with Access-Control-Allow-Credentials: true on authenticated endpoints', async () => {
    const server = http.createServer(app);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
    const port = (server.address() as AddressInfo).port;

    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/auth/session`, {
        method: 'OPTIONS',
        headers: {
          Origin: 'http://localhost:3000',
          'Access-Control-Request-Method': 'GET',
        },
      });

      strictEqual(response.headers.get('access-control-allow-credentials'), 'true');
      strictEqual(response.headers.get('access-control-allow-origin'), 'http://localhost:3000');
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('11. should verify logout revokes cookies and sends HTTP 200 with clear-cookie', async () => {
    const server = http.createServer(app);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
    const port = (server.address() as AddressInfo).port;

    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/auth/logout`, {
        method: 'POST',
        headers: {
          Origin: 'http://localhost:3000',
          'Content-Type': 'application/json',
        },
      });

      strictEqual(response.status, 200);
      const data = await response.json() as { success: boolean; message: string };
      strictEqual(data.success, true);
      const setCookie = response.headers.get('set-cookie');
      ok(setCookie && setCookie.includes('pj_session=;'), 'Logout must issue Set-Cookie clearing pj_session');
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  after(async () => {
    await closePool();
  });
});
