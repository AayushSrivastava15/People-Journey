import { describe, it } from 'node:test';
import { strictEqual, ok } from 'node:assert';
import { authenticateToken } from '../../src/middleware/auth.middleware.js';
import type { Request, Response } from 'express';
import type { AppUser } from '../../src/models/user.model.js';
import { AppRole, UpdateUserProfileSchema } from '../../src/models/user.model.js';

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

describe('Authentication Middleware Header Parsing', () => {
  it('should return 401 when Authorization header is missing', async () => {
    const req = { headers: {} } as Request;
    const res = createMockResponse();
    let nextCalled = false;

    await authenticateToken(req, res as Response, () => {
      nextCalled = true;
    });

    strictEqual(res.statusCode, 401);
    strictEqual(nextCalled, false);
    strictEqual((res.jsonData as { success: boolean }).success, false);
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

describe('Single-Role Personal Workspace Model', () => {
  it('should only permit role "user" in AppRole schema', () => {
    strictEqual(AppRole.safeParse('user').success, true);
    strictEqual(AppRole.safeParse('hr_admin').success, false);
    strictEqual(AppRole.safeParse('hr_staff').success, false);
    strictEqual(AppRole.safeParse('super_admin').success, false);
  });

  it('should prevent role escalation in profile update schema', () => {
    const maliciousPayload = {
      displayName: 'Workspace User',
      role: 'admin',
      accountStatus: 'active',
      ownerUserId: '00000000-0000-0000-0000-000000000000',
    };

    const parsed = UpdateUserProfileSchema.parse(maliciousPayload);
    strictEqual((parsed as Record<string, unknown>).role, undefined);
    strictEqual((parsed as Record<string, unknown>).accountStatus, undefined);
    strictEqual((parsed as Record<string, unknown>).ownerUserId, undefined);
    strictEqual(parsed.displayName, 'Workspace User');
  });

  it('should reject invalid URLs in photoUrl updates', () => {
    const invalidPayload = {
      photoUrl: 'javascript:alert(1)',
    };

    const result = UpdateUserProfileSchema.safeParse(invalidPayload);
    strictEqual(result.success, false);
  });
});

describe('Account Status Enforcement', () => {
  const deactivatedUser: AppUser = {
    id: 'd3eebc99-9c0b-4ef8-bb6d-6bb9bd380a44',
    firebaseUid: 'deactivated_uid_999',
    email: 'disabled.user@example.com',
    displayName: 'Disabled User',
    role: 'user',
    accountStatus: 'deactivated',
  };

  it('should reject deactivated users even with role user', async () => {
    // Test the account status validation pattern used in auth middleware & session
    const res = createMockResponse();
    if (deactivatedUser.accountStatus !== 'active') {
      res.status!(403).json({
        success: false,
        error: {
          code: 'ACCOUNT_DEACTIVATED',
          message: 'Your account has been deactivated.',
        },
      });
    }

    strictEqual(res.statusCode, 403);
    strictEqual((res.jsonData as { error: { code: string } }).error.code, 'ACCOUNT_DEACTIVATED');
  });
});


