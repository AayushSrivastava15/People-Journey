import { describe, it } from 'node:test';
import { strictEqual, deepStrictEqual } from 'node:assert';
import { authenticateToken, requireRole } from '../../src/middleware/auth.middleware';
import type { Request, Response } from 'express';
import type { HrUser } from '../../src/models/user.model';

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

describe('Authentication Middleware', () => {
  it('should return 401 when Authorization header is missing', async () => {
    const req = { headers: {} } as Request;
    const res = createMockResponse();
    let nextCalled = false;

    await authenticateToken(req, res as Response, () => {
      nextCalled = true;
    });

    strictEqual(res.statusCode, 401);
    strictEqual(nextCalled, false);
    strictEqual((res.jsonData as { authorized: boolean }).authorized, false);
  });

  it('should return 401 when Authorization header does not start with Bearer', async () => {
    const req = { headers: { authorization: 'Basic 12345' } } as unknown as Request;
    const res = createMockResponse();
    let nextCalled = false;

    await authenticateToken(req, res as Response, () => {
      nextCalled = true;
    });

    strictEqual(res.statusCode, 401);
    strictEqual(nextCalled, false);
  });

  it('should return 401 when Bearer token is empty', async () => {
    const req = { headers: { authorization: 'Bearer ' } } as unknown as Request;
    const res = createMockResponse();
    let nextCalled = false;

    await authenticateToken(req, res as Response, () => {
      nextCalled = true;
    });

    strictEqual(res.statusCode, 401);
    strictEqual(nextCalled, false);
  });
});

describe('Role-based Authorization Middleware', () => {
  const mockUser: HrUser = {
    hrUserId: 1,
    firebaseUid: 'test_uid_123',
    email: 'staff@peoplejourney.com',
    fullName: 'Test Staff',
    role: 'hr_staff',
    isActive: true,
  };

  it('should allow user with required role', () => {
    const req = { user: mockUser } as unknown as Request;
    const res = createMockResponse();
    let nextCalled = false;

    const middleware = requireRole(['hr_staff', 'hr_admin']);
    middleware(req, res as Response, () => {
      nextCalled = true;
    });

    strictEqual(nextCalled, true);
    strictEqual(res.statusCode, undefined);
  });

  it('should return 403 when user lacks required role', () => {
    const req = { user: mockUser } as unknown as Request;
    const res = createMockResponse();
    let nextCalled = false;

    const middleware = requireRole(['hr_admin']);
    middleware(req, res as Response, () => {
      nextCalled = true;
    });

    strictEqual(res.statusCode, 403);
    strictEqual(nextCalled, false);
    strictEqual((res.jsonData as { authorized: boolean }).authorized, false);
  });

  it('should return 401 when user is missing from request', () => {
    const req = {} as Request;
    const res = createMockResponse();
    let nextCalled = false;

    const middleware = requireRole(['hr_admin']);
    middleware(req, res as Response, () => {
      nextCalled = true;
    });

    strictEqual(res.statusCode, 401);
    strictEqual(nextCalled, false);
  });
});
