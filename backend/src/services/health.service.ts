import type { HealthCheckResponse } from '../models/health.model';

export const healthService = {
  check(): HealthCheckResponse {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    };
  },
};
