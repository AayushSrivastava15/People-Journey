import type { HealthCheckResponse } from '../models/health.model.js';
import { testConnection, isPoolInitialized } from '../config/database.js';

export const healthService = {
  async check(): Promise<HealthCheckResponse> {
    const dbTest = await testConnection();

    let dbStatus: 'connected' | 'disconnected' | 'uninitialized';
    if (dbTest.healthy) {
      dbStatus = 'connected';
    } else if (dbTest.poolInitialized) {
      dbStatus = 'disconnected';
    } else {
      dbStatus = 'uninitialized';
    }

    const overallStatus: 'ok' | 'degraded' | 'error' =
      dbTest.healthy ? 'ok' : dbStatus === 'uninitialized' ? 'degraded' : 'error';

    return {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      database: {
        status: dbStatus,
        poolInitialized: isPoolInitialized(),
        latencyMs: dbTest.latencyMs,
        message: dbTest.healthy ? 'Supabase PostgreSQL connection healthy' : dbTest.error,
      },
    };
  },
};
