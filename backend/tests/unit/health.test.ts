import { describe, it, after } from 'node:test';
import { strictEqual, ok } from 'node:assert';
import { healthService } from '../../src/services/health.service';
import { closePool } from '../../src/config/database';

describe('Health Service', () => {
  after(async () => {
    await closePool();
  });

  it('should return health check structure with database status', async () => {
    const result = await healthService.check();

    ok(['ok', 'degraded', 'error'].includes(result.status), 'status must be ok, degraded, or error');
    ok(result.timestamp, 'timestamp must be present');
    ok(typeof result.uptime === 'number', 'uptime must be a number');
    ok(result.database, 'database section must be present');
    ok(['connected', 'disconnected', 'uninitialized'].includes(result.database.status), 'database status must be valid');
    strictEqual(typeof result.database.poolInitialized, 'boolean');
  });
});
