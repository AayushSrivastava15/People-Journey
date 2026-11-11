import pg from 'pg';
import { AsyncLocalStorage } from 'node:async_hooks';
import { env } from './env.js';
import { logger } from '../utils/logger.js';

const { Pool } = pg;

export interface ConnectionTestResult {
  healthy: boolean;
  poolInitialized: boolean;
  latencyMs?: number;
  error?: string;
}

/**
 * Tenant authorization and isolation context for PostgreSQL transactions.
 * Applied strictly using transaction-scoped settings (SET LOCAL / set_config is_local = true).
 */
export interface TenantContext {
  userId?: string;
  companyId?: string;
  role?: 'user' | 'hr_staff' | 'hr_admin' | 'super_admin' | 'anonymous_survey' | 'auth_bootstrap' | string;
  shortCode?: string;
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ROLE_REGEX = /^[a-zA-Z0-9_]{1,64}$/;
const SHORT_CODE_REGEX = /^[a-zA-Z0-9_-]{1,64}$/;

/**
 * Strict validation of tenant context fields before SQL transaction initialization.
 * Prevents injection attacks and enforces expected identifiers.
 */
export function validateTenantContext(context: TenantContext): void {
  if (!context || typeof context !== 'object') {
    throw new Error('Invalid tenant context: context must be a non-null object');
  }

  const hasAnyProp = Boolean(
    context.userId ||
    context.companyId ||
    context.role ||
    context.shortCode
  );

  if (!hasAnyProp) {
    throw new Error('Invalid tenant context: at least one context identifier (userId, role, companyId, or shortCode) must be provided');
  }

  if (context.userId !== undefined && context.userId !== null && context.userId !== '') {
    if (typeof context.userId !== 'string' || !UUID_REGEX.test(context.userId)) {
      throw new Error(`Invalid tenant context: userId must be a valid UUID format, received: "${context.userId}"`);
    }
  }

  if (context.companyId !== undefined && context.companyId !== null && context.companyId !== '') {
    if (typeof context.companyId !== 'string' || !UUID_REGEX.test(context.companyId)) {
      throw new Error(`Invalid tenant context: companyId must be a valid UUID format, received: "${context.companyId}"`);
    }
  }

  if (context.role !== undefined && context.role !== null && context.role !== '') {
    if (typeof context.role !== 'string' || !ROLE_REGEX.test(context.role)) {
      throw new Error(`Invalid tenant context: role must be alphanumeric with underscores, received: "${context.role}"`);
    }
  }

  if (context.shortCode !== undefined && context.shortCode !== null && context.shortCode !== '') {
    if (typeof context.shortCode !== 'string' || !SHORT_CODE_REGEX.test(context.shortCode)) {
      throw new Error(`Invalid tenant context: shortCode must be alphanumeric, received: "${context.shortCode}"`);
    }
  }

  // Require userId when role implies an authenticated personal or HR workspace actor
  const userRoles = ['user', 'hr_staff', 'hr_admin'];
  if (context.role && userRoles.includes(context.role) && !context.userId) {
    throw new Error(`Missing user context: userId is required when role is "${context.role}"`);
  }
}

// AsyncLocalStorage tracking to detect and prevent nested transaction misuse
const activeTransactionStorage = new AsyncLocalStorage<{ inTransaction: boolean; context?: TenantContext }>();

let pool: pg.Pool | null = null;
let migrationPool: pg.Pool | null = null;
let isInitializing = false;

function buildPoolConfig(connectionString: string, maxPool = 10): pg.PoolConfig {
  const isCloudHost = connectionString.includes('supabase.com') || connectionString.includes('amazonaws.com') || connectionString.includes('sslmode=require');
  
  return {
    connectionString,
    min: env.DATABASE_POOL_MIN || 1,
    max: maxPool,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
    ssl: isCloudHost ? { rejectUnauthorized: false } : undefined,
  };
}

/**
 * Initializes the primary PostgreSQL connection pool for application queries.
 * Connects via DATABASE_URL (Transaction-mode pooler, port 6543).
 */
export async function initPool(): Promise<pg.Pool> {
  if (pool) {
    return pool;
  }

  if (isInitializing) {
    while (isInitializing) {
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    if (pool) return pool;
  }

  isInitializing = true;
  try {
    if (!env.DATABASE_URL) {
      throw new Error('DATABASE_URL environment variable is not configured.');
    }

    // Mask password in logs
    const sanitizedUrl = env.DATABASE_URL.replace(/:\/\/([^:]+):([^@]+)@/, '://$1:****@');
    logger.info({ connectionString: sanitizedUrl }, 'Initializing PostgreSQL connection pool...');

    pool = new Pool(buildPoolConfig(env.DATABASE_URL, env.DATABASE_POOL_MAX));

    // Handle background pool errors gracefully
    pool.on('error', (err) => {
      logger.error({ message: err.message }, 'Unexpected idle PostgreSQL client error');
    });

    // Test a client acquisition
    const client = await pool.connect();
    try {
      await client.query('SELECT 1 AS ping');
      logger.info('PostgreSQL connection pool initialized and verified successfully.');
    } finally {
      client.release();
    }

    return pool;
  } catch (err) {
    const error = err as Error;
    logger.error({ message: error.message }, 'Failed to initialize PostgreSQL connection pool');
    throw error;
  } finally {
    isInitializing = false;
  }
}

/**
 * Retrieves a dedicated session-mode pool for migrations and DDL operations.
 * Connects via DIRECT_URL (Session-mode pooler, port 5432) or falls back to DATABASE_URL.
 */
export function getMigrationPool(): pg.Pool {
  if (migrationPool) return migrationPool;

  const connectionString = env.DIRECT_URL || env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('Neither DIRECT_URL nor DATABASE_URL is configured for migrations.');
  }

  const isDirect = Boolean(env.DIRECT_URL);
  const sanitized = connectionString.replace(/:\/\/([^:]+):([^@]+)@/, '://$1:****@');
  logger.info({ connectionString: sanitized, isDirectSessionPooler: isDirect }, 'Creating session-mode migration pool...');

  migrationPool = new Pool(buildPoolConfig(connectionString, 3));
  migrationPool.on('error', (err) => {
    logger.error({ message: err.message }, 'Migration pool idle client error');
  });

  return migrationPool;
}

/**
 * Returns the active application pool or null if not yet initialized.
 */
export function getPool(): pg.Pool | null {
  return pool;
}

/**
 * Returns true if the connection pool has been created.
 */
export function isPoolInitialized(): boolean {
  return pool !== null;
}

/**
 * Safely drains and closes active connection pools.
 */
export async function closePool(): Promise<void> {
  if (pool) {
    try {
      logger.info('Closing PostgreSQL application pool...');
      await pool.end();
      pool = null;
      logger.info('PostgreSQL application pool closed.');
    } catch (err) {
      logger.error({ message: (err as Error).message }, 'Error closing application pool');
    }
  }

  if (migrationPool) {
    try {
      logger.info('Closing PostgreSQL migration pool...');
      await migrationPool.end();
      migrationPool = null;
      logger.info('Error closing migration pool');
    } catch (err) {
      logger.error({ message: (err as Error).message }, 'Error closing migration pool');
    }
  }
}

/**
 * Executes a callback within a managed PostgreSQL transaction enriched with tenant context.
 * Injects transaction-scoped settings using `set_config(..., ..., true)`.
 * Commits on success, rolls back on error, and guarantees connection release in all execution paths.
 * Prevents nested transaction misuse. Never uses session-level SET commands.
 */
export async function withTenantContext<T>(
  context: TenantContext,
  callback: (client: pg.PoolClient) => Promise<T>
): Promise<T> {
  validateTenantContext(context);

  const activeStore = activeTransactionStorage.getStore();
  if (activeStore?.inTransaction) {
    throw new Error('Nested transaction misuse detected: withTenantContext cannot be nested within an active transaction block.');
  }

  const activePool = pool || (await initPool());
  const client = await activePool.connect();

  try {
    return await activeTransactionStorage.run({ inTransaction: true, context }, async () => {
      await client.query('BEGIN');

      // Inject transaction-local variables via set_config(name, value, is_local = true)
      // Never use session-level SET commands because connection poolers recycle connections
      if (context.userId) {
        await client.query('SELECT set_config($1, $2, true)', ['app.current_user_id', context.userId]);
      }
      if (context.companyId) {
        await client.query('SELECT set_config($1, $2, true)', ['app.current_company_id', context.companyId]);
      }
      if (context.role) {
        await client.query('SELECT set_config($1, $2, true)', ['app.current_user_role', context.role]);
      }
      if (context.shortCode) {
        await client.query('SELECT set_config($1, $2, true)', ['app.survey_short_code', context.shortCode]);
      }

      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    });
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackErr) {
      logger.error({ message: (rollbackErr as Error).message }, 'Failed to rollback tenant transaction');
    }
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Executes a callback within a managed PostgreSQL transaction.
 * Commits on success, rolls back on error, and always releases the connection.
 * Optionally accepts a TenantContext for transaction-scoped isolation.
 */
export async function withTransaction<T>(
  callback: (client: pg.PoolClient) => Promise<T>,
  context?: TenantContext
): Promise<T> {
  if (context) {
    return withTenantContext(context, callback);
  }

  const activeStore = activeTransactionStorage.getStore();
  if (activeStore?.inTransaction) {
    throw new Error('Nested transaction misuse detected: withTransaction cannot be nested within an active transaction block.');
  }

  const activePool = pool || (await initPool());
  const client = await activePool.connect();

  try {
    return await activeTransactionStorage.run({ inTransaction: true }, async () => {
      await client.query('BEGIN');
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    });
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackErr) {
      logger.error({ message: (rollbackErr as Error).message }, 'Failed to rollback transaction');
    }
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Executes a single parameterized SQL query within an isolated tenant transaction.
 * Automatically wraps the query with transaction-scoped tenant context and commits immediately.
 */
export async function executeTenantSql<T extends pg.QueryResultRow = Record<string, unknown>>(
  context: TenantContext,
  sql: string,
  params: unknown[] = []
): Promise<pg.QueryResult<T>> {
  return withTenantContext(context, async (client) => {
    return client.query<T>(sql, params);
  });
}

/**
 * Executes a single parameterized SQL query using a pooled connection.
 * Guarantees release of client back to the pool in all execution paths.
 * If TenantContext is provided, delegates to executeTenantSql.
 */
export async function executeSql<T extends pg.QueryResultRow = Record<string, unknown>>(
  sql: string,
  params: unknown[] = [],
  context?: TenantContext
): Promise<pg.QueryResult<T>> {
  if (context) {
    return executeTenantSql<T>(context, sql, params);
  }

  const activePool = pool || (await initPool());
  const client = await activePool.connect();

  try {
    const result = await client.query<T>(sql, params);
    return result;
  } catch (err) {
    const error = err as Error;
    logger.error({ sql, message: error.message }, 'PostgreSQL query execution error');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Returns the active ambient tenant context from AsyncLocalStorage, if currently inside a tenant transaction.
 */
export function getActiveTenantContext(): TenantContext | undefined {
  return activeTransactionStorage.getStore()?.context;
}

/**
 * Tests PostgreSQL database connectivity and measures roundtrip query latency.
 */
export async function testConnection(): Promise<ConnectionTestResult> {
  const start = Date.now();

  try {
    if (!pool && env.DATABASE_URL) {
      try {
        await initPool();
      } catch {
        // Handled below
      }
    }

    if (!pool) {
      return {
        healthy: false,
        poolInitialized: false,
        error: 'PostgreSQL connection pool is not initialized (DATABASE_URL missing or connection failed).',
      };
    }

    const result = await executeSql<{ ping: number }>('SELECT 1 AS ping');
    const latencyMs = Date.now() - start;
    const isHealthy = result.rows?.[0]?.ping === 1;

    return {
      healthy: isHealthy,
      poolInitialized: true,
      latencyMs,
    };
  } catch (err) {
    const error = err as Error;
    // Sanitize any password keywords or values from error message
    let safeMessage = error.message.replace(/password\s*=\s*[^\s]+/gi, 'credential=****');
    safeMessage = safeMessage.replace(/password authentication failed/gi, 'Authentication failed');

    return {
      healthy: false,
      poolInitialized: pool !== null,
      latencyMs: Date.now() - start,
      error: safeMessage,
    };
  }
}
