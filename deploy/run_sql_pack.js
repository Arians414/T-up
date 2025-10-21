const fs = require('fs');
const path = require('path');
const { Client } = require(path.join(__dirname, 'node_modules', 'pg'));

const SQL_FILE = path.join(__dirname, 'sql_pack_referrals_and_kpis.sql');

const connection = {
  host: 'db.sxgqbxgeoqsbssiwbbpi.supabase.co',
  port: 5432,
  user: 'postgres',
  password: '!G8S?RkXmbFcn3v',
  database: 'postgres',
  ssl: { rejectUnauthorized: false },
};

const requiredTables = [
  'creators',
  'referral_codes',
  'referral_sessions',
  'referrals',
  'referral_revenue_log',
  'creator_payouts',
];

const requiredViews = [
  'vw_creator_summary',
  'vw_code_summary',
];

const requiredProfileColumns = [
  'referred_code',
  'referred_creator_id',
  'referred_at',
];

async function main() {
  const sql = fs.readFileSync(SQL_FILE, 'utf8');

  const client = new Client(connection);

  try {
    await client.connect();
  } catch (err) {
    console.error('Connection failed:', err.message);
    process.exitCode = 1;
    return;
  }

  try {
    await client.query(sql);
  } catch (err) {
    console.error('SQL execution failed:', err.message);
    process.exitCode = 1;
    await client.end();
    return;
  }

  const results = {
    tables: {},
    views: {},
    profileColumns: {},
  };

  try {
    for (const table of requiredTables) {
      const { rows } = await client.query(
        'SELECT to_regclass($1) IS NOT NULL AS exists',
        [`public.${table}`],
      );
      results.tables[table] = rows[0]?.exists === true;
    }

    for (const view of requiredViews) {
      const { rows } = await client.query(
        'SELECT to_regclass($1) IS NOT NULL AS exists',
        [`public.${view}`],
      );
      results.views[view] = rows[0]?.exists === true;
    }

    for (const column of requiredProfileColumns) {
      const { rows } = await client.query(
        `SELECT COUNT(*)::int AS count
         FROM information_schema.columns
         WHERE table_schema = 'public'
           AND table_name = 'profiles'
           AND column_name = $1`,
        [column],
      );
      results.profileColumns[column] = rows[0]?.count > 0;
    }
  } catch (err) {
    console.error('Verification failed:', err.message);
    process.exitCode = 1;
    await client.end();
    return;
  }

  await client.end();

  const format = (obj) =>
    Object.entries(obj)
      .map(([key, ok]) => `${ok ? '✅' : '❌'} ${key}`)
      .join('\n');

  console.log('Tables:\n' + format(results.tables));
  console.log('\nViews:\n' + format(results.views));
  console.log('\nProfiles columns:\n' + format(results.profileColumns));

  const allGood = [
    ...Object.values(results.tables),
    ...Object.values(results.views),
    ...Object.values(results.profileColumns),
  ].every(Boolean);

  if (!allGood) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error('Unexpected error:', err);
  process.exitCode = 1;
});
