import { describe, it } from 'node:test';
import { strictEqual } from 'node:assert';
import { healthService } from '../../src/services/health.service';

describe('Health Service', () => {
  it('should return ok status', () => {
    const result = healthService.check();
    strictEqual(result.status, 'ok');
  });
});
