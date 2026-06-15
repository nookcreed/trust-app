import type { AppKitLike } from './types-appkit';

export async function ensureTablesExist(appkit: AppKitLike): Promise<void> {
  const db = appkit.lakebase;

  await db.query('CREATE SCHEMA IF NOT EXISTS app');

  await db.query(`
    CREATE TABLE IF NOT EXISTS app.planner_notes (
      id SERIAL PRIMARY KEY,
      facility_id TEXT NOT NULL,
      dimension TEXT,
      note TEXT NOT NULL,
      decision TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS app.assessment_events (
      id SERIAL PRIMARY KEY,
      facility_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      details JSONB,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  console.log('[trustdesk] App-schema tables ensured.');
}
