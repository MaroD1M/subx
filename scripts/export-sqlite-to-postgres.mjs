#!/usr/bin/env node
/**
 * One-shot SQLite -> PostgreSQL data migration.
 * Creates the PostgreSQL schema, copies common columns and resets identity
 * sequences. It migrates data only; the application runtime still chooses the
 * database through DATABASE_URL.
 */
import { readFileSync } from 'fs'
import Database from 'better-sqlite3'
import pg from 'pg'

const args = process.argv.slice(2)
function arg(name, fallback = '') {
  const index = args.indexOf(`--${name}`)
  return index >= 0 ? String(args[index + 1] || '') : fallback
}

const sqlitePath = arg('sqlite', process.env.DB_PATH || 'db/subx.db')
const databaseUrl = arg('database-url', process.env.DATABASE_URL || '')
if (!databaseUrl) {
  console.error('Usage: DATABASE_URL=postgres://... node scripts/export-sqlite-to-postgres.mjs --sqlite db/subx.db')
  process.exit(1)
}

const sqlite = new Database(sqlitePath, { readonly: true })
const client = new pg.Client({ connectionString: databaseUrl })
const schema = readFileSync(new URL('./postgres-schema.sql', import.meta.url), 'utf-8')

const tables = [
  'config', 'tasks', 'translations_cache', 'task_responses', 'transcription_runs', 'asr_segments',
  'watch_folders', 'watch_events', 'notification_channels', 'notification_deliveries',
  'api_tokens', 'api_audit_logs', 'integration_events', 'task_jobs', 'task_logs',
  'task_review_entries', 'translation_quality_runs', 'translation_quality_entries',
  'auth', 'sessions', 'schema_migrations'
]

function columns(table) {
  return sqlite.prepare(`PRAGMA table_info(${table})`).all().map(column => column.name)
}

try {
  await client.connect()
  await client.query('BEGIN')
  await client.query(schema)
  let total = 0
  for (const table of tables) {
    const existing = columns(table)
    if (!existing.length) continue
    const targetColumns = (await client.query(
      'SELECT column_name FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = $1',
      [table]
    )).rows.map(row => row.column_name)
    const shared = existing.filter(column => targetColumns.includes(column))
    if (!shared.length) continue
    const rows = sqlite.prepare(`SELECT ${shared.map(column => `"${column}"`).join(', ')} FROM ${table}`).all()
    if (!rows.length) continue
    const columnList = shared.map(column => `"${column}"`).join(', ')
    const placeholders = shared.map((_, index) => `$${index + 1}`).join(', ')
    const batchSize = 200
    for (let offset = 0; offset < rows.length; offset += batchSize) {
      const batch = rows.slice(offset, offset + batchSize)
      const values = []
      const groups = []
      batch.forEach((row, rowIndex) => {
        groups.push(`(${shared.map((_, columnIndex) => `$${rowIndex * shared.length + columnIndex + 1}`).join(', ')})`)
        for (const column of shared) values.push(row[column])
      })
      await client.query(`INSERT INTO ${table} (${columnList}) VALUES ${groups.join(', ')} ON CONFLICT DO NOTHING`, values)
    }
    total += rows.length
    console.log(`${table}: ${rows.length}`)
  }
  for (const table of tables) {
    const idColumn = (await client.query(
      "SELECT column_name FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = $1 AND is_identity = 'YES'",
      [table]
    )).rows[0]?.column_name
    if (idColumn) {
      await client.query(`SELECT setval(pg_get_serial_sequence('${table}', '${idColumn}'), COALESCE((SELECT MAX(${idColumn}) FROM ${table}), 1), (SELECT COUNT(*) > 0 FROM ${table}))`)
    }
  }
  await client.query('COMMIT')
  console.log(`Done. Migrated ${total} rows.`)
} catch (error) {
  await client.query('ROLLBACK').catch(() => {})
  console.error('Migration failed:', error)
  process.exitCode = 1
} finally {
  await client.end().catch(() => {})
  sqlite.close()
}
