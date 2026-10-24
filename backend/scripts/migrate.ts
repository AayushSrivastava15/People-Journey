import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getMigrationPool, closePool } from '../src/config/database';
import { logger } from '../src/utils/logger';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runMigrations() {
  const migrationsDir = path.resolve(__dirname, '../src/migrations');
  if (!fs.existsSync(migrationsDir)) {
    logger.error({ dir: migrationsDir }, 'Migrations directory does not exist');
    process.exit(1);
  }

  const pool = getMigrationPool();
  let client;

  try {
    client = await pool.connect();
    logger.info('Connected to PostgreSQL database for migrations.');

    // Ensure schema_migrations table exists
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version VARCHAR(100) PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Get applied migrations
    const appliedRes = await client.query<{ version: string }>(
      'SELECT version FROM schema_migrations ORDER BY version ASC'
    );
    const appliedSet = new Set(appliedRes.rows.map(r => r.version));

    // Get available migration files
    const files = fs.readdirSync(migrationsDir)
      .filter(f => f.endsWith('.sql'))
      .sort();

    logger.info({ totalFound: files.length, alreadyApplied: appliedSet.size }, 'Evaluating migration files...');

    let newlyApplied = 0;
    for (const file of files) {
      if (appliedSet.has(file)) {
        logger.info({ file }, 'Migration already applied, skipping.');
        continue;
      }

      const filePath = path.join(migrationsDir, file);
      const sqlContent = fs.readFileSync(filePath, 'utf-8');

      logger.info({ file }, 'Applying migration...');
      await client.query('BEGIN');
      try {
        await client.query(sqlContent);
        await client.query(
          'INSERT INTO schema_migrations (version) VALUES ($1)',
          [file]
        );
        await client.query('COMMIT');
        logger.info({ file }, 'Successfully applied migration.');
        newlyApplied++;
      } catch (err) {
        await client.query('ROLLBACK');
        logger.error({ file, message: (err as Error).message }, 'Migration failed; transaction rolled back.');
        throw err;
      }
    }

    logger.info({ newlyApplied }, 'Migration process completed successfully.');
  } catch (err) {
    logger.error({ message: (err as Error).message }, 'Fatal migration error');
    process.exitCode = 1;
  } finally {
    if (client) client.release();
    await closePool();
  }
}

runMigrations().catch((err) => {
  console.error('Unhandled migration failure:', err);
  process.exit(1);
});
