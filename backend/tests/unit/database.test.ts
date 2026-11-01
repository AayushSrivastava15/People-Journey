import { describe, it, after } from 'node:test';
import { strictEqual, ok } from 'node:assert';
import { isPoolInitialized, testConnection, closePool } from '../../src/config/database.js';

describe('Database Configuration & Connection Helpers', () => {
  after(async () => {
    await closePool();
  });

  it('should report pool initialized state as boolean', () => {
    strictEqual(typeof isPoolInitialized(), 'boolean');
  });

  it('should safely execute testConnection and report valid health status', async () => {
    const result = await testConnection();
    strictEqual(typeof result.healthy, 'boolean');
    strictEqual(typeof result.poolInitialized, 'boolean');
    if (!result.healthy && result.error) {
      ok(!result.error.includes('password'), 'error message must not contain password keyword');
    }
  });
});
