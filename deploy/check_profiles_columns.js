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
      `SELECT column_name
         FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'profiles'
          AND column_name IN ('display_name', 'contact_email')
        ORDER BY column_name;`,
    );
    console.log(rows);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error('Query failed:', err.message);
  process.exit(1);
});
