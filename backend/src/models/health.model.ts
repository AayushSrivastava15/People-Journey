import { z } from 'zod';

export const DatabaseHealthStatus = z.object({
  status: z.enum(['connected', 'disconnected', 'uninitialized']),
  poolInitialized: z.boolean(),
  latencyMs: z.number().optional(),
  message: z.string().optional(),
});

export const HealthCheckResponse = z.object({
  status: z.enum(['ok', 'degraded', 'error']),
  timestamp: z.string(),
  uptime: z.number(),
  database: DatabaseHealthStatus,
});

export type DatabaseHealthStatus = z.infer<typeof DatabaseHealthStatus>;
export type HealthCheckResponse = z.infer<typeof HealthCheckResponse>;
