import { logger } from './logger'

export type MigrationDialect = 'sqlite' | 'postgres'

export interface Migration {
  version: number
  name: string
  up: (db: any, dialect: MigrationDialect) => void
}

function hasSqliteColumn(db: any, table: string, column: string) {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>
  return rows.some(row => String(row.name) === column)
}

function ensureColumn(db: any, dialect: MigrationDialect, table: string, column: string, definition: string) {
  if (dialect === 'sqlite') {
    if (!hasSqliteColumn(db, table, column)) {
      db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`)
    }
    return
  }

  const row = db.prepare(`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema = current_schema() AND table_name = ? AND column_name = ?
  `).get(table, column)
  if (!row) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS ${column} ${definition}`)
  }
}

function hasTable(db: any, dialect: MigrationDialect, table: string): boolean {
  if (dialect === 'sqlite') {
    return Boolean(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name = ?").get(table))
  }
  return Boolean(db.prepare("SELECT table_name FROM information_schema.tables WHERE table_schema = current_schema() AND table_name = ?").get(table))
}

function ensureIndex(db: any, dialect: MigrationDialect, table: string, index: string, columns: string) {
  if (!hasTable(db, dialect, table)) return
  db.exec(`CREATE INDEX IF NOT EXISTS ${index} ON ${table}(${columns})`)
}

function ensureLegacyColumns(db: any, dialect: MigrationDialect) {
  const columns: Array<[string, string, string]> = [
    ['tasks', 'style_preset', "TEXT NOT NULL DEFAULT 'default'"],
    ['tasks', 'style_prompt', 'TEXT'],
    ['tasks', 'source_lang', 'TEXT'],
    ['tasks', 'source_subtitle_path', 'TEXT'],
    ['tasks', 'asr_run_id', 'INTEGER'],
    ['tasks', 'asr_confidence', 'REAL'],
    ['tasks', 'asr_checkpoint_key', 'TEXT'],
    ['tasks', 'origin', "TEXT NOT NULL DEFAULT 'manual'"],
    ['tasks', 'watch_event_id', 'INTEGER'],
    ['tasks', 'content_title', 'TEXT'],
    ['tasks', 'content_background', 'TEXT'],
    ['tasks', 'custom_instructions', 'TEXT'],
    ['tasks', 'root_id', 'TEXT'],
    ['tasks', 'bilingual_layout', "TEXT NOT NULL DEFAULT 'translated_first'"],
    ['tasks', 'subtitle_style_preset', "TEXT NOT NULL DEFAULT 'bilingual_simple'"],
    ['tasks', 'subtitle_format', "TEXT NOT NULL DEFAULT 'srt'"],
    ['tasks', 'translation_mode', "TEXT NOT NULL DEFAULT 'non_stream'"],
    ['tasks', 'force_retranslate', 'INTEGER NOT NULL DEFAULT 0'],
    ['tasks', 'step_progress', 'INTEGER NOT NULL DEFAULT 0'],
    ['tasks', 'step_message', 'TEXT'],
    ['tasks', 'track_policy_json', "TEXT NOT NULL DEFAULT '{}'"],
    ['task_responses', 'chunk_index', 'INTEGER NOT NULL DEFAULT 0'],
    ['task_responses', 'model', 'TEXT'],
    ['task_responses', 'raw_request', 'TEXT'],
    ['task_responses', 'response_meta', 'TEXT'],
    ['task_responses', 'prompt_tokens', 'INTEGER DEFAULT 0'],
    ['task_responses', 'completion_tokens', 'INTEGER DEFAULT 0'],
    ['task_responses', 'total_tokens', 'INTEGER DEFAULT 0'],
    ['task_logs', 'category', "TEXT NOT NULL DEFAULT 'system'"],
    ['task_review_entries', 'sort_order', 'INTEGER NOT NULL DEFAULT 0'],
    ['task_review_entries', 'asr_confidence', 'REAL'],
    ['task_review_entries', 'quality_score', 'REAL'],
    ['task_review_entries', 'quality_issues', "TEXT NOT NULL DEFAULT '[]'"]
  ]
  for (const [table, column, definition] of columns) {
    ensureColumn(db, dialect, table, column, definition)
  }
}

function ensureProofreadCache(db: any, dialect: MigrationDialect) {
  if (dialect === 'sqlite') {
    db.exec(`
      CREATE TABLE IF NOT EXISTS task_proofread_cache (
        task_id TEXT NOT NULL,
        kind TEXT NOT NULL,
        fingerprint TEXT NOT NULL,
        model TEXT NOT NULL DEFAULT '',
        provider_type TEXT NOT NULL DEFAULT '',
        entry_count INTEGER NOT NULL DEFAULT 0,
        total_entries INTEGER NOT NULL DEFAULT 0,
        result_json TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY (task_id, kind)
      )
    `)
    return
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS task_proofread_cache (
      task_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      fingerprint TEXT NOT NULL,
      model TEXT NOT NULL DEFAULT '',
      provider_type TEXT NOT NULL DEFAULT '',
      entry_count INTEGER NOT NULL DEFAULT 0,
      total_entries INTEGER NOT NULL DEFAULT 0,
      result_json TEXT NOT NULL DEFAULT '{}',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (task_id, kind)
    )
  `)
}

export const MIGRATIONS: Migration[] = [
  {
    version: 3,
    name: 'baseline-columns-and-proofread-cache',
    up(db, dialect) {
      ensureLegacyColumns(db, dialect)
      ensureProofreadCache(db, dialect)
      const stats = db.prepare(`
        SELECT COUNT(*) AS total, SUM(CASE WHEN sort_order = 0 THEN 1 ELSE 0 END) AS zero_rows
        FROM task_review_entries
      `).get() as { total?: number | string, zero_rows?: number | string }
      const total = Number(stats?.total || 0)
      const zeroRows = Number(stats?.zero_rows || 0)
      if (total > 0 && zeroRows === total) {
        db.exec('UPDATE task_review_entries SET sort_order = CAST(subtitle_id AS INTEGER) WHERE sort_order = 0')
      }
    }
  },
  {
    version: 5,
    name: 'asr-checkpoints',
    up(db, dialect) {
      if (dialect === 'sqlite') {
        db.exec(`
          CREATE TABLE IF NOT EXISTS asr_checkpoints (
            checkpoint_key TEXT NOT NULL,
            chunk_index INTEGER NOT NULL,
            start_ms INTEGER NOT NULL,
            end_ms INTEGER NOT NULL,
            status TEXT NOT NULL DEFAULT 'done',
            language TEXT,
            confidence REAL DEFAULT 0,
            engine TEXT,
            model TEXT,
            segments_json TEXT NOT NULL DEFAULT '[]',
            updated_at TEXT NOT NULL DEFAULT (datetime('now')),
            PRIMARY KEY (checkpoint_key, chunk_index)
          )
        `)
      } else {
        db.exec(`
          CREATE TABLE IF NOT EXISTS asr_checkpoints (
            checkpoint_key TEXT NOT NULL,
            chunk_index INTEGER NOT NULL,
            start_ms INTEGER NOT NULL,
            end_ms INTEGER NOT NULL,
            status TEXT NOT NULL DEFAULT 'done',
            language TEXT,
            confidence DOUBLE PRECISION DEFAULT 0,
            engine TEXT,
            model TEXT,
            segments_json TEXT NOT NULL DEFAULT '[]',
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            PRIMARY KEY (checkpoint_key, chunk_index)
          )
        `)
      }
      ensureIndex(db, dialect, 'asr_checkpoints', 'idx_asr_checkpoints_updated_at', 'updated_at')
    }
  },
  {
    version: 4,
    name: 'task-query-indexes',
    up(db, dialect) {
      ensureIndex(db, dialect, 'task_logs', 'idx_task_logs_task_id', 'task_id, id')
      ensureIndex(db, dialect, 'task_responses', 'idx_task_responses_task_chunk', 'task_id, chunk_index')
      ensureIndex(db, dialect, 'integration_events', 'idx_integration_events_dedupe', 'source, event, path, status, created_at')
    }
  },
]

export function runMigrations(db: any, dialect: MigrationDialect) {
  const lockId = 8142026
  for (const migration of MIGRATIONS) {
    db.exec('BEGIN')
    try {
      if (dialect === 'postgres') {
        db.exec(`SELECT pg_advisory_xact_lock(${lockId})`)
      }
      const applied = db.prepare('SELECT version FROM schema_migrations WHERE version = ?').get(migration.version)
      if (applied) {
        db.exec('COMMIT')
        continue
      }
      migration.up(db, dialect)
      db.prepare('INSERT OR IGNORE INTO schema_migrations (version) VALUES (?)').run(migration.version)
      db.exec('COMMIT')
      logger.info({ version: migration.version, name: migration.name, dialect }, 'database migration applied')
    } catch (error) {
      try { db.exec('ROLLBACK') } catch { /* ignore rollback failure */ }
      throw error
    }
  }
}
