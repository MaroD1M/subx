/**
 * Database entry point.
 *
 * SQLite is the default embedded database. When DATABASE_URL starts with
 * postgres:// or postgresql://, useDb() switches to the PostgreSQL sync bridge.
 * Any schema change must be applied to both this file and scripts/postgres-schema.sql.
 */

import Database from 'better-sqlite3'
import { join } from 'path'
import { existsSync, mkdirSync, readFileSync } from 'fs'
import { PgDatabase } from './pgSync'
import { runMigrations } from './migrations'
import { SQLITE_SCHEMA_SQL } from './schema'

let _db: any = null

export function useDb() {
  if (_db) return _db

  const databaseUrl = String(process.env.DATABASE_URL || '').trim()
  if (/^postgres(ql)?:\/\//i.test(databaseUrl)) {
    _db = new PgDatabase(databaseUrl)
    const schemaPath = join(process.cwd(), 'scripts', 'postgres-schema.sql')
    if (!existsSync(schemaPath)) {
      throw new Error(`PostgreSQL schema 文件不存在: ${schemaPath}`)
    }
    _db.exec(readFileSync(schemaPath, 'utf-8'))
    _db.prepare('INSERT OR IGNORE INTO schema_migrations (version) VALUES (1)').run()
    _db.prepare('INSERT OR IGNORE INTO schema_migrations (version) VALUES (2)').run()
    runMigrations(_db, 'postgres')
    return _db
  }

  const dbPath = process.env.DB_PATH || join(process.cwd(), 'db', 'subx.db')
  const dbDir = join(dbPath, '..')

  if (!existsSync(dbDir)) {
    mkdirSync(dbDir, { recursive: true })
  }

  _db = new Database(dbPath)
  _db.pragma('journal_mode = WAL')

  // Initialize tables
  _db.exec(SQLITE_SCHEMA_SQL)


  // One-time migration: sessions now store SHA-256 token hashes instead of raw tokens.
  try {
    const migrated = _db.prepare('SELECT version FROM schema_migrations WHERE version = 2').get()
    if (!migrated) {
      _db.prepare('DELETE FROM sessions').run()
      _db.prepare('INSERT OR IGNORE INTO schema_migrations (version) VALUES (2)').run()
    }
    _db.prepare("DELETE FROM config WHERE key = 'auth_session_hash_v1'").run()
  } catch { /* migration is best-effort */ }

  runMigrations(_db, 'sqlite')

  // Performance indexes
  _db.exec(`
    CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
    CREATE INDEX IF NOT EXISTS idx_tasks_created_at ON tasks(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_task_responses_task_id ON task_responses(task_id);
    CREATE INDEX IF NOT EXISTS idx_task_responses_task_chunk ON task_responses(task_id, chunk_index);
    CREATE INDEX IF NOT EXISTS idx_task_logs_task_id ON task_logs(task_id, id);
    CREATE INDEX IF NOT EXISTS idx_integration_events_dedupe ON integration_events(source, event, path, status, created_at);
    CREATE INDEX IF NOT EXISTS idx_task_jobs_status ON task_jobs(status, next_run_at);
    CREATE INDEX IF NOT EXISTS idx_transcription_runs_task_id ON transcription_runs(task_id);
    CREATE INDEX IF NOT EXISTS idx_asr_segments_run_id ON asr_segments(run_id);
    CREATE INDEX IF NOT EXISTS idx_watch_events_folder_status ON watch_events(folder_id, status, created_at);
    CREATE INDEX IF NOT EXISTS idx_watch_events_status ON watch_events(status, created_at);
    CREATE INDEX IF NOT EXISTS idx_watch_events_task_id ON watch_events(task_id);
    CREATE INDEX IF NOT EXISTS idx_notification_deliveries_status ON notification_deliveries(status, next_run_at);
    CREATE INDEX IF NOT EXISTS idx_notification_deliveries_channel ON notification_deliveries(channel_id);
    CREATE INDEX IF NOT EXISTS idx_api_tokens_hash ON api_tokens(token_hash);
    CREATE INDEX IF NOT EXISTS idx_api_audit_logs_created ON api_audit_logs(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_api_audit_logs_token ON api_audit_logs(token_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_integration_events_created ON integration_events(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_task_review_entries_task_id ON task_review_entries(task_id);
    CREATE INDEX IF NOT EXISTS idx_task_review_entries_status ON task_review_entries(task_id, review_status);
    CREATE INDEX IF NOT EXISTS idx_task_review_entries_sort ON task_review_entries(task_id, sort_order);
    CREATE INDEX IF NOT EXISTS idx_translation_quality_runs_task ON translation_quality_runs(task_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_translation_quality_entries_run ON translation_quality_entries(run_id);
    CREATE INDEX IF NOT EXISTS idx_translation_quality_entries_task ON translation_quality_entries(task_id, subtitle_id);
    CREATE INDEX IF NOT EXISTS idx_tasks_origin_status ON tasks(origin, status);
    CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);
    CREATE INDEX IF NOT EXISTS idx_translations_cache_updated_at ON translations_cache(updated_at);
  `)

  return _db
}
