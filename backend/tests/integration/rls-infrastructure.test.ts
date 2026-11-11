/**
 * Application Tenant Context & Transaction Engine Verification Tests
 *
 * NOTE: These tests validate the Node.js application-side tenant context engine:
 * - TenantContext input validation and SQL injection defense
 * - Transaction-local GUC configuration via set_config(..., true)
 * - AsyncLocalStorage isolation and nested transaction detection
 * - Guaranteed transaction rollback and connection pool release
 * - PgBouncer connection cleanliness (no session-level bleeding across pool clients)
 *
 * NOTE ON DATABASE IDENTITY:
 * These tests execute using the local application connection (DATABASE_URL).
 * Tests validating strict PostgreSQL database-level permission boundaries for the
 * restricted runtime role (people_journey_app) are defined in:
 * tests/integration/staging-runtime-role.test.ts
 */

import { describe, it, after } from 'node:test';
import assert from 'node:assert';
import {
  withTenantContext,
  withTransaction,
  executeSql,
  executeTenantSql,
  getActiveTenantContext,
  closePool,
  validateTenantContext,
  type TenantContext,
} from '../../src/config/database.js';
import { env } from '../../src/config/env.js';

describe('RLS Infrastructure & Tenant Context Verification Tests', () => {
  after(async () => {
    await closePool();
  });

  const testUserA = '11111111-1111-4111-8111-111111111111';
  const testUserB = '22222222-2222-4222-8222-222222222222';
  const testCompany = '33333333-3333-4333-8333-333333333333';

  it('1. should validate tenant context format strictly and reject invalid context', () => {
    // Empty context
    assert.throws(
      () => validateTenantContext({} as TenantContext),
      /at least one context identifier.*must be provided/
    );

    // Non-UUID userId
    assert.throws(
      () => validateTenantContext({ userId: 'invalid-user-uuid', role: 'user' }),
      /userId must be a valid UUID format/
    );

    // SQL injection attempt in userId
    assert.throws(
      () => validateTenantContext({ userId: "'; DROP TABLE app_users; --", role: 'user' }),
      /userId must be a valid UUID format/
    );

    // Non-UUID companyId
    assert.throws(
      () => validateTenantContext({ userId: testUserA, companyId: 'not-a-uuid', role: 'user' }),
      /companyId must be a valid UUID format/
    );

    // Invalid role format
    assert.throws(
      () => validateTenantContext({ userId: testUserA, role: 'invalid role with spaces' }),
      /role must be alphanumeric/
    );

    // Invalid shortCode format
    assert.throws(
      () => validateTenantContext({ role: 'anonymous_survey', shortCode: 'code with spaces!' }),
      /shortCode must be alphanumeric/
    );

    // Missing userId when role is 'user'
    assert.throws(
      () => validateTenantContext({ role: 'user' }),
      /Missing user context: userId is required when role is "user"/
    );

    // Missing userId when role is 'hr_admin'
    assert.throws(
      () => validateTenantContext({ role: 'hr_admin' }),
      /Missing user context: userId is required when role is "hr_admin"/
    );

    // Valid auth_bootstrap (no userId required)
    assert.doesNotThrow(() => validateTenantContext({ role: 'auth_bootstrap' }));

    // Valid anonymous_survey (no userId required)
    assert.doesNotThrow(() => validateTenantContext({ role: 'anonymous_survey', shortCode: 'PufdtdX' }));

    // Valid user context
    assert.doesNotThrow(() => validateTenantContext({ userId: testUserA, role: 'user' }));
  });

  it('2. should initialize transaction-local context settings correctly', async () => {
    if (!env.DATABASE_URL) return;

    await withTenantContext(
      {
        userId: testUserA,
        companyId: testCompany,
        role: 'hr_admin',
        shortCode: 'SURVEY123',
      },
      async (client) => {
        // Verify AsyncLocalStorage active context
        const ambient = getActiveTenantContext();
        assert.ok(ambient);
        assert.strictEqual(ambient.userId, testUserA);
        assert.strictEqual(ambient.role, 'hr_admin');

        // Verify PostgreSQL transaction-local GUC settings
        const res = await client.query<{
          current_uid: string;
          current_comp: string;
          current_role: string;
          current_code: string;
        }>(
          `SELECT
             current_setting('app.current_user_id', true) AS current_uid,
             current_setting('app.current_company_id', true) AS current_comp,
             current_setting('app.current_user_role', true) AS current_role,
             current_setting('app.survey_short_code', true) AS current_code`
        );

        const row = res.rows[0];
        assert.strictEqual(row.current_uid, testUserA);
        assert.strictEqual(row.current_comp, testCompany);
        assert.strictEqual(row.current_role, 'hr_admin');
        assert.strictEqual(row.current_code, 'SURVEY123');
      }
    );
  });

  it('3. should rollback transaction and propagate errors on failure', async () => {
    if (!env.DATABASE_URL) return;

    const testDeptName = `ROLLBACK_TEST_${Date.now()}`;
    let caughtError = false;

    try {
      await withTenantContext({ userId: testUserA, role: 'user' }, async (client) => {
        await client.query(
          `INSERT INTO hr_departments (department_name, description, is_active, owner_user_id)
           VALUES ($1, 'Temporary department meant for rollback test', TRUE, $2)`,
          [testDeptName, null]
        );
        throw new Error('INTENTIONAL_TRANSACTION_FAILURE');
      });
    } catch (err) {
      caughtError = true;
      assert.strictEqual((err as Error).message, 'INTENTIONAL_TRANSACTION_FAILURE');
    }

    assert.ok(caughtError, 'withTenantContext must propagate the callback error');

    // Verify uncommitted insert was rolled back completely
    const verify = await executeSql<{ count: string }>(
      `SELECT count(*) AS count FROM hr_departments WHERE department_name = $1`,
      [testDeptName]
    );
    assert.strictEqual(parseInt(verify.rows[0].count, 10), 0);
  });

  it('4. should prevent nested transaction misuse', async () => {
    if (!env.DATABASE_URL) return;

    let nestedCaught = false;

    try {
      await withTenantContext({ userId: testUserA, role: 'user' }, async () => {
        // Attempt nested withTenantContext call within active transaction
        await withTenantContext({ userId: testUserB, role: 'user' }, async () => {
          return true;
        });
      });
    } catch (err) {
      nestedCaught = true;
      assert.match((err as Error).message, /Nested transaction misuse detected/);
    }

    assert.ok(nestedCaught, 'Should reject nested withTenantContext invocation');

    let nestedTxCaught = false;
    try {
      await withTenantContext({ userId: testUserA, role: 'user' }, async () => {
        // Attempt nested withTransaction call within active transaction
        await withTransaction(async () => {
          return true;
        });
      });
    } catch (err) {
      nestedTxCaught = true;
      assert.match((err as Error).message, /Nested transaction misuse detected/);
    }

    assert.ok(nestedTxCaught, 'Should reject nested withTransaction invocation');
  });

  it('5. should guarantee connection release in both success and rollback paths', async () => {
    if (!env.DATABASE_URL) return;

    // Successful run: releases client
    await withTenantContext({ userId: testUserA, role: 'user' }, async (client) => {
      const res = await client.query('SELECT 1 AS val');
      assert.strictEqual(res.rows[0].val, 1);
    });

    // Rollback run: releases client in finally
    try {
      await withTenantContext({ userId: testUserA, role: 'user' }, async () => {
        throw new Error('TEST_RELEASE_ON_ERROR');
      });
    } catch {
      // Expected
    }

    // Subsequent query succeeds immediately, proving pool connections were not leaked or starved
    const ping = await executeSql<{ ping: number }>('SELECT 1 AS ping');
    assert.strictEqual(ping.rows[0].ping, 1);
  });

  it('6. should strictly isolate concurrent requests without setting leakage across connections', async () => {
    if (!env.DATABASE_URL) return;

    // Simulate two concurrent requests running in parallel with different tenant identities
    const [resultA, resultB] = await Promise.all([
      withTenantContext({ userId: testUserA, role: 'user' }, async (client) => {
        // Introduce small interleaving delay
        await new Promise((resolve) => setTimeout(resolve, 50));
        const res = await client.query<{ uid: string; role: string }>(
          `SELECT current_setting('app.current_user_id', true) AS uid,
                  current_setting('app.current_user_role', true) AS role`
        );
        return res.rows[0];
      }),
      withTenantContext({ userId: testUserB, role: 'hr_admin' }, async (client) => {
        await new Promise((resolve) => setTimeout(resolve, 50));
        const res = await client.query<{ uid: string; role: string }>(
          `SELECT current_setting('app.current_user_id', true) AS uid,
                  current_setting('app.current_user_role', true) AS role`
        );
        return res.rows[0];
      }),
    ]);

    // Request A must see testUserA
    assert.strictEqual(resultA.uid, testUserA);
    assert.strictEqual(resultA.role, 'user');

    // Request B must see testUserB
    assert.strictEqual(resultB.uid, testUserB);
    assert.strictEqual(resultB.role, 'hr_admin');

    // Crucial: After transaction ends, verify pooled connection has no lingering state (no leakage)
    const outsideTx = await executeSql<{ uid: string; role: string }>(
      `SELECT current_setting('app.current_user_id', true) AS uid,
              current_setting('app.current_user_role', true) AS role`
    );

    // In PostgreSQL, transaction-scoped set_config(..., ..., true) clears upon COMMIT
    assert.strictEqual(outsideTx.rows[0].uid || '', '', 'Tenant context must not bleed across transactions in pooler mode');
  });

  it('7. should execute single queries cleanly via executeTenantSql helper', async () => {
    if (!env.DATABASE_URL) return;

    const res = await executeTenantSql<{ val: number; uid: string }>(
      { userId: testUserA, role: 'user' },
      `SELECT 42 AS val, current_setting('app.current_user_id', true) AS uid`
    );

    assert.strictEqual(res.rows[0].val, 42);
    assert.strictEqual(res.rows[0].uid, testUserA);
  });
});
