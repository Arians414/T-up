const { Client } = require('./node_modules/pg');

async function main() {
  const client = new Client({
    host: 'db.sxgqbxgeoqsbssiwbbpi.supabase.co',
    port: 5432,
    user: 'postgres',
    password: '!G8S?RkXmbFcn3v',
    database: 'postgres',
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  try {
    const { rows } = await client.query(
      `SELECT version, statements
         FROM supabase_migrations.schema_migrations
        WHERE version IN ('20250123','20250129')
        ORDER BY version;`,
    );
    console.log(JSON.stringify(rows, null, 2));
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error('Query failed:', err.message);
  process.exit(1);
});
