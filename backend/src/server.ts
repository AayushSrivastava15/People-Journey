import app from './app';
import { env } from './config/env';
import { logger } from './utils/logger';
import { initPool, closePool } from './config/database';

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

  const server = app.listen(env.PORT, () => {
    logger.info({ port: env.PORT, env: env.NODE_ENV }, 'People Journey API server listening');
  });

  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'Graceful shutdown initiated: closing HTTP server and PostgreSQL pool');
    server.close(async () => {
      logger.info('HTTP server closed');
      await closePool();
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
}

bootstrap().catch(err => {
  logger.error({ err }, 'Fatal error during server bootstrap');
  process.exit(1);
});
