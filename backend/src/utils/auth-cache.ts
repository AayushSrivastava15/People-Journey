import type { AppUser } from '../models/user.model';

interface CachedUserEntry {
  user: AppUser;
  cachedAt: number;
}

const userAuthCache = new Map<string, CachedUserEntry>();
const CACHE_TTL_MS = 60 * 1000; // 60-second TTL

export const authCache = {
  get(firebaseUid: string): AppUser | null {
    const cached = userAuthCache.get(firebaseUid);
    if (!cached) return null;
    if (Date.now() - cached.cachedAt >= CACHE_TTL_MS) {
      userAuthCache.delete(firebaseUid);
      return null;
    }
    return cached.user;
  },

  set(firebaseUid: string, user: AppUser): void {
    userAuthCache.set(firebaseUid, { user, cachedAt: Date.now() });
  },

  invalidate(identifier?: string): void {
    if (!identifier) {
      userAuthCache.clear();
      return;
    }
    userAuthCache.delete(identifier);
    for (const [key, entry] of userAuthCache.entries()) {
      if (entry.user.id === identifier || entry.user.firebaseUid === identifier) {
        userAuthCache.delete(key);
      }
    }
  },

  size(): number {
    return userAuthCache.size;
  },
};
