import type { CompanyProfile, CompanyOnboardingStatus } from '../models/company-profile.model.js';
import { env } from '../config/env.js';
import { getRedisClient } from '../middleware/rate-limiter.js';
import { logger } from './logger.js';

interface CacheEntry<T> {
  data: T;
  cachedAt: number;
}

const profileCache = new Map<string, CacheEntry<CompanyProfile | null>>();
const onboardingStatusCache = new Map<string, CacheEntry<CompanyOnboardingStatus>>();

const DEFAULT_TTL_MS = (env.COMPANY_PROFILE_CACHE_TTL_SECONDS || 300) * 1000;

/**
 * Server-side cache for Company Profile and Onboarding Status.
 * Scoped strictly by owner_user_id to preserve tenant isolation.
 */
export const companyProfileCache = {
  async getProfile(ownerUserId: string): Promise<CompanyProfile | null | undefined> {
    if (!ownerUserId) return undefined;

    const redis = getRedisClient();
    if (redis) {
      try {
        const cached = await redis.get(`pj:cache:profile:${ownerUserId}`);
        if (cached !== null) {
          return cached === '__NULL__' ? null : (JSON.parse(cached) as CompanyProfile);
        }
      } catch (err) {
        logger.warn({ message: (err as Error).message }, 'Redis profile cache read failed');
      }
    }

    const entry = profileCache.get(ownerUserId);
    if (!entry) return undefined;

    if (Date.now() - entry.cachedAt >= DEFAULT_TTL_MS) {
      profileCache.delete(ownerUserId);
      return undefined;
    }

    return entry.data;
  },

  async setProfile(ownerUserId: string, profile: CompanyProfile | null): Promise<void> {
    if (!ownerUserId) return;

    profileCache.set(ownerUserId, {
      data: profile,
      cachedAt: Date.now(),
    });

    const redis = getRedisClient();
    if (redis) {
      try {
        await redis.set(
          `pj:cache:profile:${ownerUserId}`,
          profile ? JSON.stringify(profile) : '__NULL__',
          'EX',
          Math.ceil(DEFAULT_TTL_MS / 1000)
        );
      } catch (err) {
        logger.warn({ message: (err as Error).message }, 'Redis profile cache write failed');
      }
    }
  },

  async getOnboardingStatus(ownerUserId: string): Promise<CompanyOnboardingStatus | null> {
    if (!ownerUserId) return null;

    const redis = getRedisClient();
    if (redis) {
      try {
        const cached = await redis.get(`pj:cache:onboarding:${ownerUserId}`);
        if (cached) {
          return JSON.parse(cached) as CompanyOnboardingStatus;
        }
      } catch (err) {
        logger.warn({ message: (err as Error).message }, 'Redis onboarding cache read failed');
      }
    }

    const entry = onboardingStatusCache.get(ownerUserId);
    if (!entry) return null;

    if (Date.now() - entry.cachedAt >= DEFAULT_TTL_MS) {
      onboardingStatusCache.delete(ownerUserId);
      return null;
    }

    return entry.data;
  },

  async setOnboardingStatus(ownerUserId: string, status: CompanyOnboardingStatus): Promise<void> {
    if (!ownerUserId) return;

    onboardingStatusCache.set(ownerUserId, {
      data: status,
      cachedAt: Date.now(),
    });

    const redis = getRedisClient();
    if (redis) {
      try {
        await redis.set(
          `pj:cache:onboarding:${ownerUserId}`,
          JSON.stringify(status),
          'EX',
          Math.ceil(DEFAULT_TTL_MS / 1000)
        );
      } catch (err) {
        logger.warn({ message: (err as Error).message }, 'Redis onboarding cache write failed');
      }
    }
  },

  async invalidate(ownerUserId?: string): Promise<void> {
    if (!ownerUserId) {
      profileCache.clear();
      onboardingStatusCache.clear();
      return;
    }

    profileCache.delete(ownerUserId);
    onboardingStatusCache.delete(ownerUserId);

    const redis = getRedisClient();
    if (redis) {
      try {
        await redis.del(`pj:cache:profile:${ownerUserId}`, `pj:cache:onboarding:${ownerUserId}`);
      } catch (err) {
        logger.warn({ message: (err as Error).message }, 'Redis profile cache invalidate failed');
      }
    }
  },

  clear(): void {
    profileCache.clear();
    onboardingStatusCache.clear();
  },

  size(): number {
    return profileCache.size + onboardingStatusCache.size;
  },
};

