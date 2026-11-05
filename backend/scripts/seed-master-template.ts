import { getMigrationPool, closePool } from '../src/config/database.js';
import { MASTER_EXIT_QUESTIONNAIRE } from '../src/config/master-exit-questionnaire.js';
import { logger } from '../src/utils/logger.js';

async function seedMasterTemplate() {
  const pool = getMigrationPool();
  const client = await pool.connect();

  try {
    logger.info('Seeding canonical Default Master Exit Questionnaire into PostgreSQL...');

    // 1. Upsert master system template
    const masterRes = await client.query(
      `INSERT INTO hr_exit_interview_templates (
        name,
        description,
        version,
        schema_json,
        is_active,
        is_default,
        is_system_template,
        updated_at
      ) VALUES ($1, $2, $3, $4, TRUE, TRUE, TRUE, CURRENT_TIMESTAMP)
      ON CONFLICT (name) WHERE is_system_template DO UPDATE SET
        description = EXCLUDED.description,
        schema_json = EXCLUDED.schema_json,
        updated_at = CURRENT_TIMESTAMP
      RETURNING id, version;`,
      [
        'Default Master Exit Questionnaire',
        'Standard 9-section exit feedback questionnaire covering role, manager, culture, compensation, and transition formalities.',
        1,
        JSON.stringify(MASTER_EXIT_QUESTIONNAIRE),
      ]
    );

    const masterId = masterRes.rows[0].id;
    const masterVer = masterRes.rows[0].version;

    // 2. Ensure version 1 exists in hr_exit_interview_template_versions
    await client.query(
      `INSERT INTO hr_exit_interview_template_versions (
        template_id,
        version_number,
        schema_json,
        change_summary,
        published_at
      ) VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
      ON CONFLICT (template_id, version_number) DO UPDATE SET
        schema_json = EXCLUDED.schema_json;`,
      [masterId, masterVer, JSON.stringify(MASTER_EXIT_QUESTIONNAIRE), 'Canonical 9-section master questionnaire.']
    );

    logger.info({ masterId, version: masterVer }, 'Successfully seeded master system template & version history.');
  } catch (error) {
    logger.error({ message: (error as Error).message }, 'Failed to seed master template');
    throw error;
  } finally {
    client.release();
    await closePool();
  }
}

seedMasterTemplate().catch(err => {
  console.error(err);
  process.exit(1);
});

