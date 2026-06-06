import Database from 'better-sqlite3'
import { join } from 'path'
import { existsSync, mkdirSync } from 'fs'

let _db: Database.Database | null = null

export function useDb() {
  if (_db) return _db

  const config = useRuntimeConfig()
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
      subtitle_format TEXT NOT NULL DEFAULT 'srt',
      subtitle_style_preset TEXT NOT NULL DEFAULT 'bilingual_simple',
      bilingual_layout TEXT NOT NULL DEFAULT 'translated_first',
      status TEXT NOT NULL DEFAULT 'queued',
      progress INTEGER NOT NULL DEFAULT 0,
      total_chunks INTEGER DEFAULT 0,
      done_chunks INTEGER DEFAULT 0,
      output_path TEXT,
      error TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS translation_cache (
      hash TEXT PRIMARY KEY,
      source_text TEXT NOT NULL,
      translated TEXT NOT NULL,
      model TEXT NOT NULL,
      target_lang TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
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
      prompt_tokens INTEGER DEFAULT 0,
      completion_tokens INTEGER DEFAULT 0,
      total_tokens INTEGER DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
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
  `)

  // Safe migration: add style_preset column to existing databases
  try {
    _db.exec(`ALTER TABLE tasks ADD COLUMN style_preset TEXT NOT NULL DEFAULT 'default'`)
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
    _db.exec(`ALTER TABLE task_responses ADD COLUMN raw_request TEXT`)
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

  // Performance indexes
  _db.exec(`
    CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
    CREATE INDEX IF NOT EXISTS idx_tasks_created_at ON tasks(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_task_responses_task_id ON task_responses(task_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);
    CREATE INDEX IF NOT EXISTS idx_translation_cache_hash ON translation_cache(hash);
    CREATE INDEX IF NOT EXISTS idx_translation_cache_model_lang ON translation_cache(model, target_lang);
  `)

  return _db
}
