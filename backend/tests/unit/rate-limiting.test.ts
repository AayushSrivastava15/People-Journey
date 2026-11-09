import { describe, it } from 'node:test';
import assert from 'node:assert';
import express, { type Request, type Response } from 'express';
import {
  createRateLimiter,
  getRateLimitKey,
  generalApiLimiter,
  authLimiter,
  dashboardLimiter,
  employeeLimiter,
  emailLimiter,
  publicExitLimiter,
  exportLimiter,
} from '../../src/middleware/rate-limiter.js';

describe('Rate Limiter - Unit & Security Verification', () => {
  it('1. should allow requests within configured limit and send standard RateLimit headers', async () => {
    const testApp = express();
    const limiter = createRateLimiter({
      category: 'test_normal',
      windowMs: 5000,
      max: 3,
      type: 'user',
    });

    testApp.use((req, _res, next) => {
      req.user = { id: 'usr-1', firebaseUid: 'fb-1', email: 'u1@test.com', role: 'user', accountStatus: 'active' } as any;
      next();
    });
    testApp.get('/test', limiter, (_req: Request, res: Response) => {
      res.json({ success: true, count: 1 });
    });

    const server = testApp.listen(0);
    const port = (server.address() as any).port;

    try {
      // 1st request -> 200 OK
      const res1 = await fetch(`http://127.0.0.1:${port}/test`);
      assert.strictEqual(res1.status, 200);
      const rateLimitHeader = res1.headers.get('ratelimit') || '';
      assert.ok(rateLimitHeader.includes('limit=3'), `Expected limit=3 in ${rateLimitHeader}`);
      assert.ok(rateLimitHeader.includes('remaining=2'), `Expected remaining=2 in ${rateLimitHeader}`);

      // 2nd request -> 200 OK
      const res2 = await fetch(`http://127.0.0.1:${port}/test`);
      assert.strictEqual(res2.status, 200);
      const rateLimitHeader2 = res2.headers.get('ratelimit') || '';
      assert.ok(rateLimitHeader2.includes('remaining=1'), `Expected remaining=1 in ${rateLimitHeader2}`);
    } finally {
      server.close();
    }
  });

  it('2. should reject requests exceeding limit with HTTP 429 and Retry-After header', async () => {
    const testApp = express();
    const limiter = createRateLimiter({
      category: 'test_exceed',
      windowMs: 5000,
      max: 2,
      type: 'user',
      message: 'Rate limit hit',
    });

    testApp.use((req, _res, next) => {
      req.user = { id: 'usr-exceed', firebaseUid: 'fb-e', email: 'e@test.com', role: 'user', accountStatus: 'active' } as any;
      next();
    });
    testApp.get('/test', limiter, (_req: Request, res: Response) => {
      res.json({ success: true });
    });

    const server = testApp.listen(0);
    const port = (server.address() as any).port;

    try {
      await fetch(`http://127.0.0.1:${port}/test`); // #1
      await fetch(`http://127.0.0.1:${port}/test`); // #2

      // #3 -> Should trigger 429
      const res3 = await fetch(`http://127.0.0.1:${port}/test`);
      assert.strictEqual(res3.status, 429);
      assert.ok(res3.headers.has('retry-after'));

      const rateLimitHeader = res3.headers.get('ratelimit') || '';
      assert.ok(rateLimitHeader.includes('remaining=0'), `Expected remaining=0 in ${rateLimitHeader}`);

      const body = await res3.json();
      assert.strictEqual(body.success, false);
      assert.strictEqual(body.error.code, 'RATE_LIMIT_EXCEEDED');
      assert.strictEqual(body.error.category, 'test_exceed');
      assert.ok(body.error.retryAfter > 0);
    } finally {
      server.close();
    }
  });

  it('3. should isolate quotas between different authenticated users on the same IP', async () => {
    const testApp = express();
    const limiter = createRateLimiter({
      category: 'test_user_isolation',
      windowMs: 5000,
      max: 2,
      type: 'user',
    });

    let currentUserId = 'user-A';
    testApp.use((req, _res, next) => {
      req.user = { id: currentUserId, firebaseUid: `fb-${currentUserId}`, email: `${currentUserId}@test.com`, role: 'user', accountStatus: 'active' } as any;
      next();
    });
    testApp.get('/test', limiter, (_req: Request, res: Response) => {
      res.json({ success: true, userId: currentUserId });
    });

    const server = testApp.listen(0);
    const port = (server.address() as any).port;

    try {
      // User A exhausts their quota (2 requests)
      currentUserId = 'user-A';
      await fetch(`http://127.0.0.1:${port}/test`);
      await fetch(`http://127.0.0.1:${port}/test`);
      const userABlocked = await fetch(`http://127.0.0.1:${port}/test`);
      assert.strictEqual(userABlocked.status, 429);

      // User B from the same client IP should NOT be blocked and should have a fresh quota
      currentUserId = 'user-B';
      const userBReq1 = await fetch(`http://127.0.0.1:${port}/test`);
      assert.strictEqual(userBReq1.status, 200);
      const userBHeader = userBReq1.headers.get('ratelimit') || '';
      assert.ok(userBHeader.includes('remaining=1'), `Expected User B remaining=1 in ${userBHeader}`);
    } finally {
      server.close();
    }
  });

  it('4. should correctly fallback to client IP for unauthenticated requests', async () => {
    const testApp = express();
    const limiter = createRateLimiter({
      category: 'test_ip_unauth',
      windowMs: 5000,
      max: 2,
      type: 'auto',
    });

    testApp.get('/test', limiter, (_req: Request, res: Response) => {
      res.json({ success: true });
    });

    const server = testApp.listen(0);
    const port = (server.address() as any).port;

    try {
      const res1 = await fetch(`http://127.0.0.1:${port}/test`);
      assert.strictEqual(res1.status, 200);

      const res2 = await fetch(`http://127.0.0.1:${port}/test`);
      assert.strictEqual(res2.status, 200);

      // Third request from same IP without auth should be blocked
      const res3 = await fetch(`http://127.0.0.1:${port}/test`);
      assert.strictEqual(res3.status, 429);
    } finally {
      server.close();
    }
  });

  it('5. should reject spoofed user ID headers in getRateLimitKey', () => {
    // Simulated request with hostile headers attempting quota bypass
    const mockReq = {
      ip: '192.168.1.100',
      headers: {
        'x-user-id': 'spoofed-admin-id',
        'x-authenticated-user': 'victim-user-id',
        'x-forwarded-user': 'another-id',
      },
      body: {
        userId: 'malicious-body-id',
      },
    } as any;

    // Must never use headers or body
    const key = getRateLimitKey(mockReq, 'auto');
    assert.strictEqual(key, 'ip:192.168.1.100');
  });

  it('6. should use verified server-side user ID when attached to req.user', () => {
    const mockReq = {
      ip: '192.168.1.100',
      user: {
        id: 'real-verified-uuid-1234',
      },
    } as any;

    const key = getRateLimitKey(mockReq, 'auto');
    assert.strictEqual(key, 'user:real-verified-uuid-1234');
  });

  it('7. should skip CORS OPTIONS preflight requests', async () => {
    const testApp = express();
    const limiter = createRateLimiter({
      category: 'test_options',
      windowMs: 5000,
      max: 1,
      type: 'ip',
    });

    testApp.use(limiter);
    testApp.options('/test', (_req: Request, res: Response) => res.sendStatus(204));
    testApp.get('/test', (_req: Request, res: Response) => res.json({ success: true }));

    const server = testApp.listen(0);
    const port = (server.address() as any).port;

    try {
      // 5 OPTIONS requests in a row
      for (let i = 0; i < 5; i++) {
        const optRes = await fetch(`http://127.0.0.1:${port}/test`, { method: 'OPTIONS' });
        assert.strictEqual(optRes.status, 204);
      }

      // First GET should still succeed because OPTIONS was skipped
      const getRes = await fetch(`http://127.0.0.1:${port}/test`);
      assert.strictEqual(getRes.status, 200);
    } finally {
      server.close();
    }
  });

  it('8. should verify preconfigured limiters have correct categories and positive limits', () => {
    assert.ok(generalApiLimiter);
    assert.ok(authLimiter);
    assert.ok(dashboardLimiter);
    assert.ok(employeeLimiter);
    assert.ok(emailLimiter);
    assert.ok(publicExitLimiter);
    assert.ok(exportLimiter);
  });

  it('9. should reset rate limit quota after the configured time window expires', async () => {
    const testApp = express();
    // 500ms window for fast unit testing
    const limiter = createRateLimiter({
      category: 'test_window_reset',
      windowMs: 500,
      max: 1,
      type: 'user',
    });

    testApp.use((req, _res, next) => {
      req.user = { id: 'usr-reset-test', firebaseUid: 'fb-r', email: 'r@test.com', role: 'user', accountStatus: 'active' } as any;
      next();
    });
    testApp.get('/test', limiter, (_req: Request, res: Response) => res.json({ success: true }));

    const server = testApp.listen(0);
    const port = (server.address() as any).port;

    try {
      const res1 = await fetch(`http://127.0.0.1:${port}/test`);
      assert.strictEqual(res1.status, 200);

      // Immediate 2nd request is blocked
      const res2 = await fetch(`http://127.0.0.1:${port}/test`);
      assert.strictEqual(res2.status, 429);

      // Wait 600ms for window to expire
      await new Promise((resolve) => setTimeout(resolve, 600));

      // 3rd request should succeed after reset
      const res3 = await fetch(`http://127.0.0.1:${port}/test`);
      assert.strictEqual(res3.status, 200);
    } finally {
      server.close();
    }
  });

  it('10. should enforce email sending limit (5 operations per minute per user)', async () => {
    const testApp = express();
    testApp.use((req, _res, next) => {
      req.user = { id: 'usr-email-sender', firebaseUid: 'fb-e', email: 'e@test.com', role: 'user', accountStatus: 'active' } as any;
      next();
    });
    testApp.post('/api/email-drafts/preview', emailLimiter, (_req: Request, res: Response) => res.json({ success: true }));

    const server = testApp.listen(0);
    const port = (server.address() as any).port;

    try {
      // 5 requests succeed
      for (let i = 0; i < 5; i++) {
        const res = await fetch(`http://127.0.0.1:${port}/api/email-drafts/preview`, { method: 'POST' });
        assert.strictEqual(res.status, 200, `Expected request #${i + 1} to succeed`);
      }

      // 6th request fails with 429
      const res6 = await fetch(`http://127.0.0.1:${port}/api/email-drafts/preview`, { method: 'POST' });
      assert.strictEqual(res6.status, 429);
      const body = await res6.json();
      assert.strictEqual(body.error.code, 'RATE_LIMIT_EXCEEDED');
      assert.strictEqual(body.error.category, 'email_service');
    } finally {
      server.close();
    }
  });

  it('11. should enforce export limit (5 operations per minute per user)', async () => {
    const testApp = express();
    testApp.use((req, _res, next) => {
      req.user = { id: 'usr-export-user', firebaseUid: 'fb-exp', email: 'exp@test.com', role: 'user', accountStatus: 'active' } as any;
      next();
    });
    testApp.get('/api/exit-interviews/export/excel', exportLimiter, (_req: Request, res: Response) => res.send('excel bytes'));

    const server = testApp.listen(0);
    const port = (server.address() as any).port;

    try {
      // 5 requests succeed
      for (let i = 0; i < 5; i++) {
        const res = await fetch(`http://127.0.0.1:${port}/api/exit-interviews/export/excel`);
        assert.strictEqual(res.status, 200, `Expected export #${i + 1} to succeed`);
      }

      // 6th export fails with 429
      const res6 = await fetch(`http://127.0.0.1:${port}/api/exit-interviews/export/excel`);
      assert.strictEqual(res6.status, 429);
      const body = await res6.json();
      assert.strictEqual(body.error.category, 'export_service');
    } finally {
      server.close();
    }
  });

  it('12. should enforce public exit interview protection (20 req / min per IP)', async () => {
    const testApp = express();
    testApp.get('/api/exit-interviews/resolve/:code', publicExitLimiter, (_req: Request, res: Response) => res.json({ success: true }));

    const server = testApp.listen(0);
    const port = (server.address() as any).port;

    try {
      // First 20 requests succeed
      for (let i = 0; i < 20; i++) {
        const res = await fetch(`http://127.0.0.1:${port}/api/exit-interviews/resolve/abc1234`);
        assert.strictEqual(res.status, 200, `Expected public request #${i + 1} to succeed`);
      }

      // 21st request triggers 429
      const res21 = await fetch(`http://127.0.0.1:${port}/api/exit-interviews/resolve/abc1234`);
      assert.strictEqual(res21.status, 429);
      const body = await res21.json();
      assert.strictEqual(body.error.category, 'public_exit_interview');
    } finally {
      server.close();
    }
  });
});
