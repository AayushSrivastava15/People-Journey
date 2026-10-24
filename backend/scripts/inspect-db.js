const { Client } = require('pg');

async function main() {
  const client = new Client({
    connectionString: 'postgresql://postgres.qvoebbqpnqzjktnwaoke:StringPassword2003%40@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres',
    ssl: { rejectUnauthorized: false }
  });

  await client.connect();
  const res = await client.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name;");
  const tables = res.rows.map(r => r.table_name);
  console.log('Tables:', tables);

  const counts = {};
  for (const table of tables) {
    try {
      const cRes = await client.query(`SELECT count(*) FROM "${table}"`);
      counts[table] = parseInt(cRes.rows[0].count, 10);
    } catch (e) {
      counts[table] = 'Error: ' + e.message;
    }
  }
  console.log('Row counts:', JSON.stringify(counts, null, 2));
  await client.end();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
