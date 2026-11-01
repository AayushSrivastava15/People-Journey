import { describe, it } from 'node:test';
import { strictEqual, ok } from 'node:assert';
import { authCache } from '../../src/utils/auth-cache.js';
import type { AppUser } from '../../src/models/user.model.js';

describe('In-Memory Auth Cache', () => {
  const mockUser: AppUser = {
    id: '11111111-2222-3333-4444-555555555555',
    firebaseUid: 'firebase_test_user_1',
    email: 'test.user@workspace.test',
    displayName: 'Cache Tester',
    role: 'user',
    accountStatus: 'active',
  };

  it('should store and retrieve cached user profile', () => {
    authCache.set(mockUser.firebaseUid, mockUser);
    const retrieved = authCache.get(mockUser.firebaseUid);
    ok(retrieved !== null);
    strictEqual(retrieved?.id, mockUser.id);
    strictEqual(retrieved?.email, mockUser.email);
  });

  it('should invalidate cached user by userId', () => {
    authCache.set(mockUser.firebaseUid, mockUser);
    authCache.invalidate(mockUser.id);
    const retrieved = authCache.get(mockUser.firebaseUid);
    strictEqual(retrieved, null);
  });

  it('should invalidate cached user by firebaseUid', () => {
    authCache.set(mockUser.firebaseUid, mockUser);
    authCache.invalidate(mockUser.firebaseUid);
    const retrieved = authCache.get(mockUser.firebaseUid);
    strictEqual(retrieved, null);
  });

  it('should clear entire cache when no identifier is passed', () => {
    authCache.set(mockUser.firebaseUid, mockUser);
    authCache.set('another_uid', { ...mockUser, firebaseUid: 'another_uid' });
    authCache.invalidate();
    strictEqual(authCache.get(mockUser.firebaseUid), null);
    strictEqual(authCache.get('another_uid'), null);
    strictEqual(authCache.size(), 0);
  });
});
