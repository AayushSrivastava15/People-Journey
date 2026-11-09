import type { DashboardStats } from '../models/dashboard.model.js';
import type { PersonalDashboardData } from '../services/dashboard.service.js';
import { env } from '../config/env.js';
import { getRedisClient } from '../middleware/rate-limiter.js';
import { logger } from './logger.js';

interface CacheEntry<T> {
  data: T;
  cachedAt: number;
}

const statsCache = new Map<string, CacheEntry<DashboardStats>>();
const personalCache = new Map<string, CacheEntry<PersonalDashboardData>>();

const DEFAULT_TTL_MS = (env.DASHBOARD_CACHE_TTL_SECONDS || 60) * 1000;

/**
 * High-performance server-side cache for Dashboard KPI statistics and personal dashboards.
 * Guarantees strict multi-tenant isolation by requiring owner_user_id on all operations.
 * Automatically falls back to in-memory cache if Redis is not configured.
 */
export const dashboardCache = {
  /**
   * Retrieves cached dashboard KPI metrics for the given owner_user_id.
   */
  async getStats(ownerUserId: string): Promise<DashboardStats | null> {
    if (!ownerUserId) return null;

    // 1. Try Redis if connected
    const redis = getRedisClient();
    if (redis) {
      try {
        const cached = await redis.get(`pj:cache:dash:${ownerUserId}`);
        if (cached) {
          return JSON.parse(cached) as DashboardStats;
        }
      } catch (err) {
        logger.warn({ message: (err as Error).message }, 'Redis dashboard cache read failed; using in-memory');
      }
    }

    // 2. In-Memory fallback
    const entry = statsCache.get(ownerUserId);
    if (!entry) return null;

    if (Date.now() - entry.cachedAt >= DEFAULT_TTL_MS) {
      statsCache.delete(ownerUserId);
      return null;
    }

    return entry.data;
  },

  /**
   * Caches dashboard KPI metrics for the given owner_user_id.
   */
  async setStats(ownerUserId: string, stats: DashboardStats): Promise<void> {
    if (!ownerUserId) return;

    // 1. Save to in-memory store
    statsCache.set(ownerUserId, {
      data: stats,
      cachedAt: Date.now(),
    });

    // 2. Save to Redis if available
    const redis = getRedisClient();
    if (redis) {
      try {
        await redis.set(
          `pj:cache:dash:${ownerUserId}`,
          JSON.stringify(stats),
          'EX',
          Math.ceil(DEFAULT_TTL_MS / 1000)
        );
      } catch (err) {
        logger.warn({ message: (err as Error).message }, 'Redis dashboard cache write failed');
      }
    }
  },

  /**
   * Retrieves cached personal dashboard data for the given user_id.
   */
  async getPersonal(userId: string): Promise<PersonalDashboardData | null> {
    if (!userId) return null;

    const redis = getRedisClient();
    if (redis) {
      try {
        const cached = await redis.get(`pj:cache:personal:${userId}`);
        if (cached) {
          return JSON.parse(cached) as PersonalDashboardData;
        }
      } catch (err) {
        logger.warn({ message: (err as Error).message }, 'Redis personal dashboard cache read failed');
      }
    }

    const entry = personalCache.get(userId);
    if (!entry) return null;

    if (Date.now() - entry.cachedAt >= DEFAULT_TTL_MS) {
      personalCache.delete(userId);
      return null;
    }

    return entry.data;
  },

  /**
   * Caches personal dashboard data for the given user_id.
   */
  async setPersonal(userId: string, data: PersonalDashboardData): Promise<void> {
    if (!userId) return;

    personalCache.set(userId, {
      data,
      cachedAt: Date.now(),
    });

    const redis = getRedisClient();
    if (redis) {
      try {
        await redis.set(
          `pj:cache:personal:${userId}`,
          JSON.stringify(data),
          'EX',
          Math.ceil(DEFAULT_TTL_MS / 1000)
        );
      } catch (err) {
        logger.warn({ message: (err as Error).message }, 'Redis personal dashboard cache write failed');
      }
    }
  },

  /**
   * Invalidates dashboard cache when an employee is created, updated, or offboarded.
   */
  async invalidate(ownerUserId?: string): Promise<void> {
    if (!ownerUserId) {
      statsCache.clear();
      return;
    }

    statsCache.delete(ownerUserId);

    const redis = getRedisClient();
    if (redis) {
      try {
        await redis.del(`pj:cache:dash:${ownerUserId}`);
      } catch (err) {
        logger.warn({ message: (err as Error).message }, 'Redis dashboard cache invalidate failed');
      }
    }
  },

  /**
   * Invalidates personal dashboard cache when user tasks/notifications change.
   */
  async invalidatePersonal(userId?: string): Promise<void> {
    if (!userId) {
      personalCache.clear();
      return;
    }

    personalCache.delete(userId);

    const redis = getRedisClient();
    if (redis) {
      try {
        await redis.del(`pj:cache:personal:${userId}`);
      } catch (err) {
        logger.warn({ message: (err as Error).message }, 'Redis personal dashboard cache invalidate failed');
      }
    }
  },

  /**
   * Clears all cached entries across all tenants (useful during tests).
   */
  async clear(): Promise<void> {
    statsCache.clear();
    personalCache.clear();

    const redis = getRedisClient();
    if (redis) {
      try {
        const keys = await redis.keys('pj:cache:*');
        if (keys.length > 0) {
          await redis.del(...keys);
        }
      } catch (err) {
        logger.warn({ message: (err as Error).message }, 'Redis clear cache failed');
      }
    }
  },

  size(): number {
    return statsCache.size + personalCache.size;
  },
};

