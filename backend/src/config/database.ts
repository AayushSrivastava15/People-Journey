import oracledb from 'oracledb';
import { env } from './env';
import { logger } from '../utils/logger';

// Configure default Oracle driver settings (Thin mode is default in oracledb >= 6)
oracledb.outFormat = oracledb.OUT_FORMAT_OBJECT;
oracledb.autoCommit = false;

let pool: oracledb.Pool | null = null;
let isInitializing = false;

export interface ConnectionTestResult {
  healthy: boolean;
  poolInitialized: boolean;
  latencyMs?: number;
  error?: string;
}

/**
 * Initializes the Oracle connection pool using Thin mode.
 */
export async function initPool(): Promise<oracledb.Pool> {
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
    if (!env.ORACLE_PASSWORD) {
      throw new Error('ORACLE_PASSWORD environment variable is not configured.');
    }

    logger.info(
      {
        user: env.ORACLE_USER,
        connectString: env.ORACLE_CONNECT_STRING,
        poolMin: env.ORACLE_POOL_MIN,
        poolMax: env.ORACLE_POOL_MAX,
      },
      'Initializing Oracle Database connection pool (Thin mode)...'
    );

    pool = await oracledb.createPool({
      user: env.ORACLE_USER,
      password: env.ORACLE_PASSWORD,
      connectString: env.ORACLE_CONNECT_STRING,
      poolMin: env.ORACLE_POOL_MIN,
      poolMax: env.ORACLE_POOL_MAX,
      poolIncrement: env.ORACLE_POOL_INCREMENT,
      poolTimeout: 60,
    });

    logger.info('Oracle Database connection pool initialized successfully.');
    return pool;
  } catch (err) {
    const error = err as Error;
    logger.error({ message: error.message }, 'Failed to initialize Oracle connection pool');
    throw error;
  } finally {
    isInitializing = false;
  }
}

/**
 * Returns the current pool instance, or null if not yet initialized.
 */
export function getPool(): oracledb.Pool | null {
  return pool;
}

/**
 * Returns true if the connection pool has been successfully created.
 */
export function isPoolInitialized(): boolean {
  return pool !== null;
}

/**
 * Safely closes the Oracle connection pool with drain time.
 */
export async function closePool(): Promise<void> {
  if (!pool) return;

  try {
    logger.info('Closing Oracle connection pool...');
    await pool.close(10); // 10 second drain time
    pool = null;
    logger.info('Oracle connection pool closed.');
  } catch (err) {
    const error = err as Error;
    logger.error({ message: error.message }, 'Error closing Oracle connection pool');
  }
}

/**
 * Executes a single parameterized SQL query using a pooled connection.
 * Automatically acquires and releases the connection in all execution paths.
 */
export async function executeSql<T = Record<string, unknown>>(
  sql: string,
  binds: oracledb.BindParameters = {},
  options: oracledb.ExecuteOptions = {}
): Promise<oracledb.Result<T>> {
  const activePool = pool || (await initPool());
  let connection: oracledb.Connection | null = null;

  try {
    connection = await activePool.getConnection();
    const result = await connection.execute<T>(sql, binds, {
      autoCommit: options.autoCommit ?? true,
      ...options,
    });
    return result;
  } catch (err) {
    const error = err as Error;
    logger.error({ sql, message: error.message }, 'Oracle SQL execution error');
    throw error;
  } finally {
    if (connection) {
      try {
        await connection.close();
      } catch (closeErr) {
        logger.error({ message: (closeErr as Error).message }, 'Failed to release Oracle connection');
      }
    }
  }
}

/**
 * Executes a callback within a managed Oracle transaction.
 * Commits on success, rolls back on error, and always releases the connection.
 */
export async function withTransaction<T>(
  callback: (connection: oracledb.Connection) => Promise<T>
): Promise<T> {
  const activePool = pool || (await initPool());
  let connection: oracledb.Connection | null = null;

  try {
    connection = await activePool.getConnection();
    const result = await callback(connection);
    await connection.commit();
    return result;
  } catch (err) {
    if (connection) {
      try {
        await connection.rollback();
      } catch (rollbackErr) {
        logger.error({ message: (rollbackErr as Error).message }, 'Failed to rollback transaction');
      }
    }
    throw err;
  } finally {
    if (connection) {
      try {
        await connection.close();
      } catch (closeErr) {
        logger.error({ message: (closeErr as Error).message }, 'Failed to release transaction connection');
      }
    }
  }
}

/**
 * Tests Oracle database connectivity using a lightweight query against DUAL.
 */
export async function testConnection(): Promise<ConnectionTestResult> {
  const start = Date.now();

  try {
    if (!pool && env.ORACLE_PASSWORD) {
      await initPool();
    }

    if (!pool) {
      return {
        healthy: false,
        poolInitialized: false,
        error: 'Oracle connection pool is not initialized (credentials not provided or initialization failed).',
      };
    }

    const result = await executeSql<{ PING: number }>('SELECT 1 AS PING FROM DUAL', {}, { autoCommit: true });
    const latencyMs = Date.now() - start;

    const row = result.rows?.[0];
    const isHealthy = row?.PING === 1;

    return {
      healthy: isHealthy,
      poolInitialized: true,
      latencyMs,
    };
  } catch (err) {
    const error = err as Error;
    return {
      healthy: false,
      poolInitialized: pool !== null,
      latencyMs: Date.now() - start,
      error: error.message,
    };
  }
}
