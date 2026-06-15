// One-shot: grant SELECT on all public tables to the app service principal.
// Uses the Lakebase Postgres connection from .env.
import pg from 'pg';
import { readFileSync } from 'fs';

// Load .env manually
const env = Object.fromEntries(
  readFileSync('.env', 'utf8').split('\n')
    .filter(l => l && !l.startsWith('#'))
    .map(l => { const i = l.indexOf('='); return [l.slice(0,i), l.slice(i+1)]; })
);

const SP = 'd81426e8-8b71-414f-a3ae-a638b49d6700';
const client = new pg.Client({
  host: env.PGHOST,
  port: Number(env.PGPORT) || 5432,
  database: env.PGDATABASE,
  ssl: { rejectUnauthorized: false },
  // Uses your DATABRICKS_HOST OAuth token via the default Lakebase auth
});

try {
  await client.connect();
  console.log('Connected to Lakebase Postgres');

  // Check what tables exist
  const { rows: tables } = await client.query(
    "SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename"
  );
  console.log('Tables:', tables.map(t => t.tablename).join(', '));

  // Grant SELECT on each table
  for (const { tablename } of tables) {
    try {
      await client.query(`GRANT SELECT ON public."${tablename}" TO "${SP}"`);
      console.log(`  ✓ GRANT SELECT on ${tablename}`);
    } catch (e) {
      console.log(`  ✗ ${tablename}: ${e.message}`);
    }
  }

  // Also set default privileges for future tables
  await client.query(`ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO "${SP}"`);
  console.log('  ✓ ALTER DEFAULT PRIVILEGES set');

  console.log('\n✅ Done');
} catch (e) {
  console.error('Failed:', e.message);
} finally {
  await client.end();
}
