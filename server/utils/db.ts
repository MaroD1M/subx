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
  _db.exec(`
    CREATE TABLE IF NOT EXISTS config (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS tasks (
      task_id TEXT PRIMARY KEY,
      file_path TEXT NOT NULL,
      root_id TEXT,
      source_type TEXT NOT NULL DEFAULT 'embedded',
      track_index INTEGER,
      model TEXT NOT NULL,
      target_lang TEXT NOT NULL DEFAULT 'zh-CN',
      output_mode TEXT NOT NULL DEFAULT 'translated',
      style_preset TEXT NOT NULL DEFAULT 'default',
      style_prompt TEXT,
      source_lang TEXT,
      source_subtitle_path TEXT,
      asr_run_id INTEGER,
      asr_confidence REAL,
      origin TEXT NOT NULL DEFAULT 'manual',
      watch_event_id INTEGER,
      content_title TEXT,
      content_background TEXT,
      custom_instructions TEXT,
      subtitle_format TEXT NOT NULL DEFAULT 'srt',
      subtitle_style_preset TEXT NOT NULL DEFAULT 'bilingual_simple',
      bilingual_layout TEXT NOT NULL DEFAULT 'translated_first',
      force_retranslate INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'queued',
      progress INTEGER NOT NULL DEFAULT 0,
      total_chunks INTEGER DEFAULT 0,
      done_chunks INTEGER DEFAULT 0,
      output_path TEXT,
      error TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS translations_cache (
      hash TEXT PRIMARY KEY,
      original_text TEXT NOT NULL,
      translated_text TEXT NOT NULL,
      model TEXT NOT NULL,
      target_language TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS task_responses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id TEXT NOT NULL,
      chunk_index INTEGER,
      model TEXT,
      raw_request TEXT,
      raw_response TEXT,
      response_meta TEXT,
      prompt_tokens INTEGER DEFAULT 0,
      completion_tokens INTEGER DEFAULT 0,
      total_tokens INTEGER DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS transcription_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id TEXT NOT NULL,
      engine TEXT,
      model TEXT,
      device TEXT,
      language TEXT,
      duration_ms INTEGER DEFAULT 0,
      rtf REAL DEFAULT 0,
      confidence REAL DEFAULT 0,
      raw_json TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS asr_segments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id INTEGER NOT NULL,
      start_ms INTEGER NOT NULL,
      end_ms INTEGER NOT NULL,
      text TEXT NOT NULL,
      words_json TEXT,
      confidence REAL DEFAULT 0,
      no_speech_prob REAL DEFAULT 0,
      speaker TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS watch_folders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      root_id TEXT NOT NULL,
      path TEXT NOT NULL DEFAULT '',
      enabled INTEGER NOT NULL DEFAULT 1,
      recursive INTEGER NOT NULL DEFAULT 1,
      mode TEXT NOT NULL DEFAULT 'new',
      rules_json TEXT NOT NULL DEFAULT '{}',
      output_policy_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(root_id, path)
    );

    CREATE TABLE IF NOT EXISTS watch_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      folder_id INTEGER NOT NULL,
      path TEXT NOT NULL,
      size INTEGER NOT NULL DEFAULT 0,
      mtime TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      task_id TEXT,
      error TEXT,
      dedupe_key TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(folder_id, dedupe_key)
    );

    CREATE TABLE IF NOT EXISTS notification_channels (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      name TEXT NOT NULL,
      config_json TEXT NOT NULL DEFAULT '{}',
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS notification_deliveries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      channel_id INTEGER NOT NULL,
      event TEXT NOT NULL,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      attempts INTEGER NOT NULL DEFAULT 0,
      max_attempts INTEGER NOT NULL DEFAULT 3,
      next_run_at TEXT NOT NULL DEFAULT (datetime('now')),
      last_error TEXT,
      dedupe_key TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(dedupe_key)
    );

    CREATE TABLE IF NOT EXISTS api_tokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,
      prefix TEXT NOT NULL,
      scopes_json TEXT NOT NULL DEFAULT '[]',
      expires_at TEXT,
      last_used_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      revoked_at TEXT
    );

    CREATE TABLE IF NOT EXISTS integration_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source TEXT NOT NULL,
      event TEXT,
      path TEXT,
      task_id TEXT,
      status TEXT NOT NULL DEFAULT 'received',
      error TEXT,
      payload_json TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS api_audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      token_id INTEGER,
      token_name TEXT,
      method TEXT NOT NULL,
      path TEXT NOT NULL,
      status_code INTEGER,
      ip TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS translation_quality_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id TEXT NOT NULL,
      provider TEXT,
      model TEXT,
      status TEXT NOT NULL DEFAULT 'done',
      entries_checked INTEGER NOT NULL DEFAULT 0,
      avg_score REAL NOT NULL DEFAULT 0,
      issues_json TEXT NOT NULL DEFAULT '[]',
      error TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS translation_quality_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id INTEGER NOT NULL,
      task_id TEXT NOT NULL,
      subtitle_id TEXT NOT NULL,
      score REAL NOT NULL DEFAULT 0,
      issues_json TEXT NOT NULL DEFAULT '[]',
      source_text TEXT,
      translated_text TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS task_jobs (
      task_id TEXT PRIMARY KEY,
      status TEXT NOT NULL DEFAULT 'queued',
      attempts INTEGER NOT NULL DEFAULT 0,
      max_attempts INTEGER NOT NULL DEFAULT 3,
      next_run_at TEXT NOT NULL DEFAULT (datetime('now')),
      locked_by TEXT,
      locked_at TEXT,
      heartbeat_at TEXT,
      last_error TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS task_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id TEXT NOT NULL,
      step TEXT,
      category TEXT NOT NULL DEFAULT 'system',
      level TEXT NOT NULL DEFAULT 'info',
      message TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS task_review_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id TEXT NOT NULL,
      subtitle_id TEXT NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      original_text TEXT NOT NULL,
      translated_text TEXT,
      final_text TEXT,
      review_status TEXT NOT NULL DEFAULT 'translated',
      review_reasons TEXT NOT NULL DEFAULT '[]',
      asr_confidence REAL,
      quality_score REAL,
      quality_issues TEXT NOT NULL DEFAULT '[]',
      sort_order INTEGER NOT NULL DEFAULT 0,
      selected INTEGER NOT NULL DEFAULT 0,
      edited INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(task_id, subtitle_id)
    );

    CREATE TABLE IF NOT EXISTS auth (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      passkey_hash TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      expires_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `)

  // Safe migration: add style_preset column to existing databases
  try {
    _db.exec(`ALTER TABLE tasks ADD COLUMN style_preset TEXT NOT NULL DEFAULT 'default'`)
  } catch { /* column already exists */ }

  try {
    _db.exec(`ALTER TABLE tasks ADD COLUMN style_prompt TEXT`)
  } catch { /* column already exists */ }

  try {
    _db.exec(`ALTER TABLE tasks ADD COLUMN source_lang TEXT`)
  } catch { /* column already exists */ }

  try {
    _db.exec(`ALTER TABLE tasks ADD COLUMN source_subtitle_path TEXT`)
  } catch { /* column already exists */ }

  try {
    _db.exec(`ALTER TABLE tasks ADD COLUMN asr_run_id INTEGER`)
  } catch { /* column already exists */ }

  try {
    _db.exec(`ALTER TABLE tasks ADD COLUMN asr_confidence REAL`)
  } catch { /* column already exists */ }

  try {
    _db.exec(`ALTER TABLE tasks ADD COLUMN origin TEXT NOT NULL DEFAULT 'manual'`)
  } catch { /* column already exists */ }

  try {
    _db.exec(`ALTER TABLE tasks ADD COLUMN watch_event_id INTEGER`)
  } catch { /* column already exists */ }

  try {
    _db.exec(`ALTER TABLE tasks ADD COLUMN content_title TEXT`)
  } catch { /* column already exists */ }

  try {
    _db.exec(`ALTER TABLE tasks ADD COLUMN content_background TEXT`)
  } catch { /* column already exists */ }

  try {
    _db.exec(`ALTER TABLE tasks ADD COLUMN custom_instructions TEXT`)
  } catch { /* column already exists */ }

  try {
    _db.exec(`ALTER TABLE tasks ADD COLUMN root_id TEXT`)
  } catch { /* column already exists */ }

  try {
    _db.exec(`ALTER TABLE tasks ADD COLUMN bilingual_layout TEXT NOT NULL DEFAULT 'translated_first'`)
  } catch { /* column already exists */ }

  try {
    _db.exec(`ALTER TABLE tasks ADD COLUMN subtitle_style_preset TEXT NOT NULL DEFAULT 'bilingual_simple'`)
  } catch { /* column already exists */ }

  try {
    _db.exec(`ALTER TABLE tasks ADD COLUMN subtitle_format TEXT NOT NULL DEFAULT 'srt'`)
  } catch { /* column already exists */ }

  try {
    _db.exec(`ALTER TABLE tasks ADD COLUMN translation_mode TEXT NOT NULL DEFAULT 'non_stream'`)
  } catch { /* column already exists */ }

  try {
    _db.exec(`ALTER TABLE tasks ADD COLUMN force_retranslate INTEGER NOT NULL DEFAULT 0`)
  } catch { /* column already exists */ }

  try {
    _db.exec(`ALTER TABLE task_responses ADD COLUMN raw_request TEXT`)
  } catch { /* column already exists */ }

  try {
    _db.exec(`ALTER TABLE task_responses ADD COLUMN response_meta TEXT`)
  } catch { /* column already exists */ }

  try {
    _db.exec(`ALTER TABLE task_responses ADD COLUMN prompt_tokens INTEGER DEFAULT 0`)
  } catch { /* column already exists */ }

  try {
    _db.exec(`ALTER TABLE task_responses ADD COLUMN completion_tokens INTEGER DEFAULT 0`)
  } catch { /* column already exists */ }

  try {
    _db.exec(`ALTER TABLE task_responses ADD COLUMN total_tokens INTEGER DEFAULT 0`)
  } catch { /* column already exists */ }

  try {
    _db.exec(`ALTER TABLE task_logs ADD COLUMN category TEXT NOT NULL DEFAULT 'system'`)
  } catch { /* column already exists */ }

  try {
    _db.exec(`ALTER TABLE task_review_entries ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0`)
  } catch { /* column already exists */ }

  try {
    _db.exec(`ALTER TABLE task_review_entries ADD COLUMN asr_confidence REAL`)
  } catch { /* column already exists */ }

  try {
    _db.exec(`ALTER TABLE task_review_entries ADD COLUMN quality_score REAL`)
  } catch { /* column already exists */ }

  try {
    _db.exec(`ALTER TABLE task_review_entries ADD COLUMN quality_issues TEXT NOT NULL DEFAULT '[]'`)
  } catch { /* column already exists */ }

  try {
    _db.exec(`UPDATE task_review_entries SET sort_order = CAST(subtitle_id AS INTEGER) WHERE sort_order = 0`)
  } catch { /* best effort backfill */ }

  _db.prepare('INSERT OR IGNORE INTO schema_migrations (version) VALUES (1)').run()

  // Performance indexes
  _db.exec(`
    CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
    CREATE INDEX IF NOT EXISTS idx_tasks_created_at ON tasks(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_task_responses_task_id ON task_responses(task_id);
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

  // One-time migration: sessions now store SHA-256 token hashes instead of raw tokens.
  try {
    const migrated = _db.prepare('SELECT version FROM schema_migrations WHERE version = 2').get()
    if (!migrated) {
      _db.prepare('DELETE FROM sessions').run()
      _db.prepare('INSERT OR IGNORE INTO schema_migrations (version) VALUES (2)').run()
    }
    _db.prepare("DELETE FROM config WHERE key = 'auth_session_hash_v1'").run()
  } catch { /* migration is best-effort */ }

  return _db
}
