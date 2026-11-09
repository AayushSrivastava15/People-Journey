import app from './app.js';
import { env } from './config/env.js';
import { logger } from './utils/logger.js';
import { initPool, closePool } from './config/database.js';
import { closeRedisClient } from './middleware/rate-limiter.js';

async function bootstrap() {
  // Attempt to initialize PostgreSQL connection pool if DATABASE_URL is configured
  if (env.DATABASE_URL) {
    try {
      await initPool();
    } catch (err) {
      logger.warn(
        { message: (err as Error).message },
        'PostgreSQL connection pool failed to initialize during startup. Requests requiring database access will attempt initialization or return safe service status.'
      );
    }
  } else {
    logger.info('DATABASE_URL not configured. Database pool will initialize when DATABASE_URL is set.');
  }

  const server = app.listen(env.PORT, '0.0.0.0', () => {
    logger.info({ port: env.PORT, env: env.NODE_ENV }, 'People Journey API server listening');
  });

  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'Graceful shutdown initiated: closing HTTP server and PostgreSQL pool');
    server.close(async () => {
      logger.info('HTTP server closed');
      await closePool();
      await closeRedisClient();
      process.exit(0);
    });

    // Force exit after 10s if graceful shutdown hangs
    setTimeout(() => {
      logger.error('Forcefully terminating process after shutdown timeout');
      process.exit(1);
    }, 10000).unref();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  process.on('unhandledRejection', (reason: unknown) => {
    logger.error(
      {
        err: reason instanceof Error ? { message: reason.message, stack: reason.stack } : reason,
      },
      'Unhandled promise rejection caught by global handler'
    );
  });

  process.on('uncaughtException', (err: Error) => {
    logger.fatal(
      {
        err: { message: err.message, stack: err.stack },
      },
      'Uncaught exception caught by global handler - triggering graceful shutdown'
    );
    shutdown('UNCAUGHT_EXCEPTION').catch(() => process.exit(1));
  });
}

bootstrap().catch(err => {
  logger.error({ err }, 'Fatal error during server bootstrap');
  process.exit(1);
});
