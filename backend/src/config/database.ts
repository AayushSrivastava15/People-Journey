import pg from 'pg';
import { env } from './env.js';
import { logger } from '../utils/logger.js';

const { Pool } = pg;

export interface ConnectionTestResult {
  healthy: boolean;
  poolInitialized: boolean;
  latencyMs?: number;
  error?: string;
}

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
    } catch (err) {
      logger.error({ message: (err as Error).message }, 'Error closing migration pool');
    }
  }
}

/**
 * Executes a single parameterized SQL query using a pooled connection.
 * Guarantees release of client back to the pool in all execution paths.
 */
export async function executeSql<T extends pg.QueryResultRow = Record<string, unknown>>(
  sql: string,
  params: unknown[] = []
): Promise<pg.QueryResult<T>> {
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
 * Executes a callback within a managed PostgreSQL transaction.
 * Commits on success, rolls back on error, and always releases the connection.
 */
export async function withTransaction<T>(
  callback: (client: pg.PoolClient) => Promise<T>
): Promise<T> {
  const activePool = pool || (await initPool());
  const client = await activePool.connect();

  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
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
