import { initPool, closePool, executeSql } from '../src/config/database.js';

async function main() {
  await initPool();
  const r = await executeSql(`
    SELECT id, employee_id, status, short_code, template_snapshot, token_hash, expires_at, created_at
    FROM hr_exit_interviews
    WHERE employee_id = 50
    ORDER BY created_at DESC
  `);
  console.log(JSON.stringify(r.rows, null, 2));
  await closePool();
}

main().catch(console.error);

