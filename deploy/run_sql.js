const fs = require('fs');
const path = require('path');
const { Client } = require(path.join(__dirname, 'node_modules', 'pg'));

const file = process.argv[2];

if (!file) {
  console.error('Usage: node deploy/run_sql.js <path-to-sql>');
  process.exit(1);
}

const connection = {
  host: 'db.sxgqbxgeoqsbssiwbbpi.supabase.co',
  port: 5432,
  user: 'postgres',
  password: '!G8S?RkXmbFcn3v',
  database: 'postgres',
  ssl: { rejectUnauthorized: false },
};

async function main() {
  const sqlPath = path.resolve(file);
  const sql = fs.readFileSync(sqlPath, 'utf8');
  const client = new Client(connection);
  await client.connect();
  try {
    await client.query(sql);
  } finally {
    await client.end();
  }
  console.log(`Executed ${path.relative(process.cwd(), sqlPath)}`);
}

main().catch((err) => {
  console.error('Execution failed:', err.message);
  process.exit(1);
});
