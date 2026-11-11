/**
 * Staging Verification Test Suite: Restricted Runtime Role (people_journey_app)
 *
 * This test suite validates PostgreSQL permission boundaries for the unprivileged runtime role.
 * It is designed to be executed in staging after migration 009 has been applied and
 * the runtime role password has been provisioned.
 *
 * Usage:
 *   RUNTIME_APP_DATABASE_URL="postgresql://people_journey_app:<password>@<staging-host>:6543/postgres?pgbouncer=true" npm test
 *
 * If RUNTIME_APP_DATABASE_URL is not provided and the active connection is not people_journey_app,
 * these tests skip gracefully with clear instructions.
 */

import { describe, it, after } from 'node:test';
import assert from 'node:assert';
import pg from 'pg';
import { env } from '../../src/config/env.js';
import { withTenantContext } from '../../src/config/database.js';

const { Pool } = pg;

describe('Staging Restricted Runtime Role Verification (people_journey_app)', () => {
  const runtimeUrl = process.env.RUNTIME_APP_DATABASE_URL;
  let testPool: pg.Pool | null = null;
  let isRuntimeRole = false;

  after(async () => {
    if (testPool) {
      await testPool.end();
    }
  });

  async function getClient(): Promise<pg.PoolClient | null> {
    if (runtimeUrl) {
      if (!testPool) {
        testPool = new Pool({
          connectionString: runtimeUrl,
          max: 2,
          ssl: runtimeUrl.includes('supabase.com') ? { rejectUnauthorized: false } : undefined,
        });
      }
      return testPool.connect();
    }

    // Otherwise check if default connection is running as people_journey_app
    if (env.DATABASE_URL) {
      if (!testPool) {
        testPool = new Pool({
          connectionString: env.DATABASE_URL,
          max: 2,
          ssl: env.DATABASE_URL.includes('supabase.com') ? { rejectUnauthorized: false } : undefined,
        });
      }
      const client = await testPool.connect();
      const res = await client.query<{ user: string }>('SELECT current_user AS "user"');
      if (res.rows[0]?.user === 'people_journey_app') {
        isRuntimeRole = true;
        return client;
      }
      client.release();
    }

    return null;
  }

  it('1. should verify runtime role attributes: people_journey_app has NO superuser or RLS bypass', async (t) => {
    const client = await getClient();
    if (!client) {
      t.skip('Skipping: Requires connection as people_journey_app. Set RUNTIME_APP_DATABASE_URL to execute.');
      return;
    }

    try {
      const userRes = await client.query<{ user: string }>('SELECT current_user AS "user"');
      assert.strictEqual(userRes.rows[0].user, 'people_journey_app', 'Connected database user must be people_journey_app');

      const roleRes = await client.query<{ rolsuper: boolean; rolbypassrls: boolean; rolcreatedb: boolean; rolcreaterole: boolean }>(
        `SELECT rolsuper, rolbypassrls, rolcreatedb, rolcreaterole
         FROM pg_roles
         WHERE rolname = 'people_journey_app'`
      );
      const row = roleRes.rows[0];
      assert.strictEqual(row.rolsuper, false, 'people_journey_app must NOT be a superuser');
      assert.strictEqual(row.rolbypassrls, false, 'people_journey_app must NOT bypass RLS');
      assert.strictEqual(row.rolcreatedb, false, 'people_journey_app must NOT have CREATEDB');
      assert.strictEqual(row.rolcreaterole, false, 'people_journey_app must NOT have CREATEROLE');
    } finally {
      client.release();
    }
  });

  it('2. should permit normal operational DML on application tables', async (t) => {
    const client = await getClient();
    if (!client) {
      t.skip('Skipping: Requires connection as people_journey_app.');
      return;
    }

    try {
      const res = await client.query<{ count: string }>('SELECT count(*) AS count FROM hr_employees');
      assert.ok(typeof res.rows[0].count === 'string', 'Should successfully query hr_employees');
    } finally {
      client.release();
    }
  });

  it('3. should strictly DENY access to schema_migrations', async (t) => {
    const client = await getClient();
    if (!client) {
      t.skip('Skipping: Requires connection as people_journey_app.');
      return;
    }

    try {
      let denied = false;
      try {
        await client.query('SELECT * FROM schema_migrations LIMIT 1');
      } catch (err) {
        denied = true;
        // PostgreSQL error 42501: insufficient_privilege
        assert.strictEqual((err as { code?: string }).code, '42501', 'Must throw insufficient_privilege error');
      }
      assert.ok(denied, 'people_journey_app must be denied access to schema_migrations');
    } finally {
      client.release();
    }
  });

  it('4. should strictly DENY TRUNCATE on application tables', async (t) => {
    const client = await getClient();
    if (!client) {
      t.skip('Skipping: Requires connection as people_journey_app.');
      return;
    }

    try {
      let denied = false;
      try {
        await client.query('TRUNCATE TABLE hr_departments');
      } catch (err) {
        denied = true;
        assert.strictEqual((err as { code?: string }).code, '42501', 'Must throw insufficient_privilege error on TRUNCATE');
      }
      assert.ok(denied, 'people_journey_app must be denied TRUNCATE privilege');
    } finally {
      client.release();
    }
  });

  it('5. should strictly DENY DDL (table creation or alteration)', async (t) => {
    const client = await getClient();
    if (!client) {
      t.skip('Skipping: Requires connection as people_journey_app.');
      return;
    }

    try {
      let denied = false;
      try {
        await client.query('CREATE TABLE public.unauthorized_test_table (id serial primary key)');
      } catch (err) {
        denied = true;
        assert.strictEqual((err as { code?: string }).code, '42501', 'Must throw insufficient_privilege error on CREATE TABLE');
      }
      assert.ok(denied, 'people_journey_app must be denied CREATE TABLE privilege');
    } finally {
      client.release();
    }
  });

  it('6. should permit EXECUTE on app schema helper functions', async (t) => {
    const client = await getClient();
    if (!client) {
      t.skip('Skipping: Requires connection as people_journey_app.');
      return;
    }

    try {
      const res = await client.query<{
        uid: string | null;
        comp: string | null;
        role: string;
        is_admin: boolean;
      }>(
        `SELECT
           app.current_user_id() AS uid,
           app.current_company_id() AS comp,
           app.current_user_role() AS role,
           app.is_super_admin() AS is_admin`
      );
      assert.strictEqual(res.rows[0].uid, null);
      assert.strictEqual(res.rows[0].role, 'user');
      assert.strictEqual(res.rows[0].is_admin, false);
    } finally {
      client.release();
    }
  });
});

