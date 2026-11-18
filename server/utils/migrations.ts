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
    ['tasks', 'series_key', 'TEXT'],
    ['tasks', 'bilingual_layout', "TEXT NOT NULL DEFAULT 'translated_first'"],
    ['tasks', 'subtitle_style_preset', "TEXT NOT NULL DEFAULT 'bilingual_simple'"],
    ['tasks', 'subtitle_style_json', 'TEXT'],
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

function ensureSeriesProfiles(db: any, dialect: MigrationDialect) {
  ensureColumn(db, dialect, 'tasks', 'series_key', 'TEXT')
  if (dialect === 'sqlite') {
    db.exec(`
      CREATE TABLE IF NOT EXISTS series_profiles (
        series_key TEXT PRIMARY KEY,
        root_id TEXT,
        title TEXT NOT NULL DEFAULT '',
        background TEXT NOT NULL DEFAULT '',
        glossary_json TEXT NOT NULL DEFAULT '{}',
        summary TEXT NOT NULL DEFAULT '',
        last_task_id TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `)
  } else {
    db.exec(`
      CREATE TABLE IF NOT EXISTS series_profiles (
        series_key TEXT PRIMARY KEY,
        root_id TEXT,
        title TEXT NOT NULL DEFAULT '',
        background TEXT NOT NULL DEFAULT '',
        glossary_json TEXT NOT NULL DEFAULT '{}',
        summary TEXT NOT NULL DEFAULT '',
        last_task_id TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `)
  }
}

function ensureAsrCheckpoints(db: any, dialect: MigrationDialect) {
  ensureColumn(db, dialect, 'tasks', 'asr_checkpoint_key', 'TEXT')
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
  if (hasTable(db, dialect, 'asr_checkpoints')) {
    ensureColumn(db, dialect, 'asr_checkpoints', 'updated_at', dialect === 'sqlite' ? "TEXT NOT NULL DEFAULT (datetime('now'))" : 'TIMESTAMPTZ NOT NULL DEFAULT now()')
  }
  ensureIndex(db, dialect, 'asr_checkpoints', 'idx_asr_checkpoints_updated_at', 'updated_at')
}


function ensureIntelligenceTables(db: any, dialect: MigrationDialect) {
  if (dialect === 'sqlite') {
    db.exec(`
      CREATE TABLE IF NOT EXISTS library_coverage_index (
        root_id TEXT NOT NULL,
        target_language TEXT NOT NULL,
        path TEXT NOT NULL,
        status TEXT NOT NULL,
        task_id TEXT,
        task_status TEXT,
        subtitle_path TEXT,
        subtitle_source TEXT,
        matched_language TEXT,
        embedded_track_title TEXT,
        file_mtime TEXT,
        scanned_at TEXT NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY (root_id, target_language, path)
      );
      CREATE TABLE IF NOT EXISTS coverage_auto_fill_policies (
        root_id TEXT PRIMARY KEY,
        enabled INTEGER NOT NULL DEFAULT 0,
        target_language TEXT NOT NULL DEFAULT 'zh-CN',
        schedule_type TEXT NOT NULL DEFAULT 'daily',
        interval_hours INTEGER NOT NULL DEFAULT 24,
        daily_time TEXT NOT NULL DEFAULT '03:00',
        run_window_start TEXT NOT NULL DEFAULT '',
        run_window_end TEXT NOT NULL DEFAULT '',
        max_tasks_per_run INTEGER NOT NULL DEFAULT 10,
        skip_recent_days INTEGER NOT NULL DEFAULT 1,
        include_embedded INTEGER NOT NULL DEFAULT 1,
        output_policy_json TEXT NOT NULL DEFAULT '{}',
        last_run_at TEXT,
        last_run_status TEXT NOT NULL DEFAULT 'idle',
        last_run_summary TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS translation_memory (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        target_language TEXT NOT NULL,
        source_hash TEXT NOT NULL,
        source_text TEXT NOT NULL,
        translated_text TEXT NOT NULL,
        series_key TEXT NOT NULL DEFAULT '',
        source_kind TEXT NOT NULL DEFAULT 'review',
        confidence REAL NOT NULL DEFAULT 0.9,
        use_count INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(target_language, source_hash, series_key)
      );
      CREATE TABLE IF NOT EXISTS media_metadata_cache (
        cache_key TEXT PRIMARY KEY,
        payload_json TEXT NOT NULL DEFAULT '{}',
        expires_at TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS cost_usage (
        task_id TEXT PRIMARY KEY,
        model TEXT NOT NULL DEFAULT '',
        prompt_tokens INTEGER NOT NULL DEFAULT 0,
        completion_tokens INTEGER NOT NULL DEFAULT 0,
        total_tokens INTEGER NOT NULL DEFAULT 0,
        cost_usd REAL NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `)
  } else {
    db.exec(`
      CREATE TABLE IF NOT EXISTS library_coverage_index (
        root_id TEXT NOT NULL,
        target_language TEXT NOT NULL,
        path TEXT NOT NULL,
        status TEXT NOT NULL,
        task_id TEXT,
        task_status TEXT,
        subtitle_path TEXT,
        subtitle_source TEXT,
        matched_language TEXT,
        embedded_track_title TEXT,
        file_mtime TIMESTAMPTZ,
        scanned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        PRIMARY KEY (root_id, target_language, path)
      );
      CREATE TABLE IF NOT EXISTS coverage_auto_fill_policies (
        root_id TEXT PRIMARY KEY,
        enabled INTEGER NOT NULL DEFAULT 0,
        target_language TEXT NOT NULL DEFAULT 'zh-CN',
        schedule_type TEXT NOT NULL DEFAULT 'daily',
        interval_hours INTEGER NOT NULL DEFAULT 24,
        daily_time TEXT NOT NULL DEFAULT '03:00',
        run_window_start TEXT NOT NULL DEFAULT '',
        run_window_end TEXT NOT NULL DEFAULT '',
        max_tasks_per_run INTEGER NOT NULL DEFAULT 10,
        skip_recent_days INTEGER NOT NULL DEFAULT 1,
        include_embedded INTEGER NOT NULL DEFAULT 1,
        output_policy_json TEXT NOT NULL DEFAULT '{}',
        last_run_at TIMESTAMPTZ,
        last_run_status TEXT NOT NULL DEFAULT 'idle',
        last_run_summary TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE TABLE IF NOT EXISTS translation_memory (
        id BIGSERIAL PRIMARY KEY,
        target_language TEXT NOT NULL,
        source_hash TEXT NOT NULL,
        source_text TEXT NOT NULL,
        translated_text TEXT NOT NULL,
        series_key TEXT NOT NULL DEFAULT '',
        source_kind TEXT NOT NULL DEFAULT 'review',
        confidence DOUBLE PRECISION NOT NULL DEFAULT 0.9,
        use_count INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE(target_language, source_hash, series_key)
      );
      CREATE TABLE IF NOT EXISTS media_metadata_cache (
        cache_key TEXT PRIMARY KEY,
        payload_json TEXT NOT NULL DEFAULT '{}',
        expires_at TIMESTAMPTZ NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE TABLE IF NOT EXISTS cost_usage (
        task_id TEXT PRIMARY KEY,
        model TEXT NOT NULL DEFAULT '',
        prompt_tokens INTEGER NOT NULL DEFAULT 0,
        completion_tokens INTEGER NOT NULL DEFAULT 0,
        total_tokens INTEGER NOT NULL DEFAULT 0,
        cost_usd DOUBLE PRECISION NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `)
  }
  ensureIndex(db, dialect, 'library_coverage_index', 'idx_coverage_index_root_status', 'root_id, target_language, status')
  ensureIndex(db, dialect, 'translation_memory', 'idx_translation_memory_lookup', 'target_language, source_hash')
  ensureIndex(db, dialect, 'translation_memory', 'idx_translation_memory_series', 'target_language, series_key')
  ensureIndex(db, dialect, 'cost_usage', 'idx_cost_usage_created', 'created_at')
}

function ensurePauseRequestAndCoverageSnapshots(db: any, dialect: MigrationDialect) {
  ensureColumn(db, dialect, 'tasks', 'pause_requested_at', dialect === 'sqlite' ? 'TEXT' : 'TIMESTAMPTZ')
  if (dialect === 'sqlite') {
    db.exec(`
      CREATE TABLE IF NOT EXISTS coverage_snapshots (
        root_id TEXT NOT NULL,
        target_language TEXT NOT NULL,
        include_embedded INTEGER NOT NULL DEFAULT 1,
        scanned_at TEXT NOT NULL DEFAULT (datetime('now')),
        truncated INTEGER NOT NULL DEFAULT 0,
        result_json TEXT NOT NULL DEFAULT '{}',
        PRIMARY KEY (root_id, target_language, include_embedded)
      )
    `)
  } else {
    db.exec(`
      CREATE TABLE IF NOT EXISTS coverage_snapshots (
        root_id TEXT NOT NULL,
        target_language TEXT NOT NULL,
        include_embedded INTEGER NOT NULL DEFAULT 1,
        scanned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        truncated BOOLEAN NOT NULL DEFAULT FALSE,
        result_json TEXT NOT NULL DEFAULT '{}',
        PRIMARY KEY (root_id, target_language, include_embedded)
      )
    `)
  }
  ensureIndex(db, dialect, 'coverage_snapshots', 'idx_coverage_snapshots_scanned', 'scanned_at')
}


function ensureTaskBatches(db: any, dialect: MigrationDialect) {
  if (dialect === 'sqlite') {
    db.exec(`
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
      )
    `)
  } else {
    db.exec(`
      CREATE TABLE IF NOT EXISTS task_jobs (
        task_id TEXT PRIMARY KEY,
        status TEXT NOT NULL DEFAULT 'queued',
        attempts INTEGER NOT NULL DEFAULT 0,
        max_attempts INTEGER NOT NULL DEFAULT 3,
        next_run_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        locked_by TEXT,
        locked_at TIMESTAMPTZ,
        heartbeat_at TIMESTAMPTZ,
        last_error TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `)
  }
  ensureColumn(db, dialect, 'tasks', 'batch_id', 'TEXT')
  ensureColumn(db, dialect, 'task_jobs', 'batch_id', 'TEXT')
  ensureColumn(db, dialect, 'task_jobs', 'priority', 'INTEGER NOT NULL DEFAULT 0')
  ensureColumn(db, dialect, 'task_jobs', 'scheduled_at', dialect === 'sqlite' ? 'TEXT' : 'TIMESTAMPTZ')
  ensureColumn(db, dialect, 'task_jobs', 'retry_policy_json', "TEXT NOT NULL DEFAULT '{}'")
  ensureColumn(db, dialect, 'task_jobs', 'retry_category', 'TEXT')
  ensureColumn(db, dialect, 'task_jobs', 'last_retry_at', dialect === 'sqlite' ? 'TEXT' : 'TIMESTAMPTZ')

  if (dialect === 'sqlite') {
    db.exec(`
      CREATE TABLE IF NOT EXISTS task_batches (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'queued',
        priority INTEGER NOT NULL DEFAULT 0,
        scheduled_at TEXT,
        policy_json TEXT NOT NULL DEFAULT '{}',
        task_count INTEGER NOT NULL DEFAULT 0,
        completed_count INTEGER NOT NULL DEFAULT 0,
        failed_count INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        started_at TEXT,
        finished_at TEXT,
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS queue_control (
        id INTEGER PRIMARY KEY,
        paused INTEGER NOT NULL DEFAULT 0,
        paused_at TEXT,
        paused_by TEXT,
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `)
  } else {
    db.exec(`
      CREATE TABLE IF NOT EXISTS task_batches (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'queued',
        priority INTEGER NOT NULL DEFAULT 0,
        scheduled_at TIMESTAMPTZ,
        policy_json TEXT NOT NULL DEFAULT '{}',
        task_count INTEGER NOT NULL DEFAULT 0,
        completed_count INTEGER NOT NULL DEFAULT 0,
        failed_count INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        started_at TIMESTAMPTZ,
        finished_at TIMESTAMPTZ,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE TABLE IF NOT EXISTS queue_control (
        id INTEGER PRIMARY KEY,
        paused INTEGER NOT NULL DEFAULT 0,
        paused_at TIMESTAMPTZ,
        paused_by TEXT,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `)
  }
  db.prepare('INSERT OR IGNORE INTO queue_control (id) VALUES (1)').run()
  ensureIndex(db, dialect, 'task_jobs', 'idx_task_jobs_claim', 'status, priority, next_run_at')
  ensureIndex(db, dialect, 'tasks', 'idx_tasks_batch_id', 'batch_id')
  ensureIndex(db, dialect, 'task_batches', 'idx_task_batches_created_at', 'created_at DESC')
}


function ensureGlossaryTables(db: any, dialect: MigrationDialect) {
  if (dialect === 'sqlite') {
    db.exec(`
      CREATE TABLE IF NOT EXISTS glossary_entries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        source TEXT NOT NULL,
        target TEXT NOT NULL,
        source_lang TEXT NOT NULL DEFAULT '',
        target_lang TEXT NOT NULL DEFAULT '',
        scope_type TEXT NOT NULL DEFAULT 'global',
        scope_key TEXT NOT NULL DEFAULT '',
        category TEXT NOT NULL DEFAULT '',
        notes TEXT NOT NULL DEFAULT '',
        priority INTEGER NOT NULL DEFAULT 0,
        enabled INTEGER NOT NULL DEFAULT 1,
        locked INTEGER NOT NULL DEFAULT 0,
        version INTEGER NOT NULL DEFAULT 1,
        created_by TEXT NOT NULL DEFAULT '',
        updated_by TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(scope_type, scope_key, source_lang, target_lang, source)
      );
      CREATE TABLE IF NOT EXISTS glossary_versions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        entry_id INTEGER,
        version INTEGER NOT NULL DEFAULT 1,
        action TEXT NOT NULL DEFAULT 'update',
        before_json TEXT NOT NULL DEFAULT 'null',
        after_json TEXT NOT NULL DEFAULT 'null',
        batch_id TEXT,
        created_by TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS glossary_snapshots (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL DEFAULT '',
        scope_type TEXT NOT NULL DEFAULT 'global',
        scope_key TEXT NOT NULL DEFAULT '',
        entries_json TEXT NOT NULL DEFAULT '[]',
        entry_count INTEGER NOT NULL DEFAULT 0,
        note TEXT NOT NULL DEFAULT '',
        created_by TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS glossary_imports (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        filename TEXT NOT NULL DEFAULT '',
        format TEXT NOT NULL DEFAULT 'csv',
        scope_type TEXT NOT NULL DEFAULT 'global',
        scope_key TEXT NOT NULL DEFAULT '',
        total INTEGER NOT NULL DEFAULT 0,
        inserted INTEGER NOT NULL DEFAULT 0,
        updated INTEGER NOT NULL DEFAULT 0,
        skipped INTEGER NOT NULL DEFAULT 0,
        errors_json TEXT NOT NULL DEFAULT '[]',
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `)
  } else {
    db.exec(`
      CREATE TABLE IF NOT EXISTS glossary_entries (
        id INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
        source TEXT NOT NULL,
        target TEXT NOT NULL,
        source_lang TEXT NOT NULL DEFAULT '',
        target_lang TEXT NOT NULL DEFAULT '',
        scope_type TEXT NOT NULL DEFAULT 'global',
        scope_key TEXT NOT NULL DEFAULT '',
        category TEXT NOT NULL DEFAULT '',
        notes TEXT NOT NULL DEFAULT '',
        priority INTEGER NOT NULL DEFAULT 0,
        enabled INTEGER NOT NULL DEFAULT 1,
        locked INTEGER NOT NULL DEFAULT 0,
        version INTEGER NOT NULL DEFAULT 1,
        created_by TEXT NOT NULL DEFAULT '',
        updated_by TEXT NOT NULL DEFAULT '',
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE(scope_type, scope_key, source_lang, target_lang, source)
      );
      CREATE TABLE IF NOT EXISTS glossary_versions (
        id INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
        entry_id INTEGER,
        version INTEGER NOT NULL DEFAULT 1,
        action TEXT NOT NULL DEFAULT 'update',
        before_json TEXT NOT NULL DEFAULT 'null',
        after_json TEXT NOT NULL DEFAULT 'null',
        batch_id TEXT,
        created_by TEXT NOT NULL DEFAULT '',
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE TABLE IF NOT EXISTS glossary_snapshots (
        id INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
        name TEXT NOT NULL DEFAULT '',
        scope_type TEXT NOT NULL DEFAULT 'global',
        scope_key TEXT NOT NULL DEFAULT '',
        entries_json TEXT NOT NULL DEFAULT '[]',
        entry_count INTEGER NOT NULL DEFAULT 0,
        note TEXT NOT NULL DEFAULT '',
        created_by TEXT NOT NULL DEFAULT '',
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE TABLE IF NOT EXISTS glossary_imports (
        id INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
        filename TEXT NOT NULL DEFAULT '',
        format TEXT NOT NULL DEFAULT 'csv',
        scope_type TEXT NOT NULL DEFAULT 'global',
        scope_key TEXT NOT NULL DEFAULT '',
        total INTEGER NOT NULL DEFAULT 0,
        inserted INTEGER NOT NULL DEFAULT 0,
        updated INTEGER NOT NULL DEFAULT 0,
        skipped INTEGER NOT NULL DEFAULT 0,
        errors_json TEXT NOT NULL DEFAULT '[]',
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `)
  }

  const insert = db.prepare(`
    INSERT OR IGNORE INTO glossary_entries (
      source, target, source_lang, target_lang, scope_type, scope_key, category, notes, priority, enabled, locked, version, created_by, updated_by, created_at, updated_at
    ) VALUES (?, ?, '', '', ?, ?, '', '', 0, 1, 0, 1, 'migration', 'migration', datetime('now'), datetime('now'))
  `)
  const normalize = (input: unknown) => {
    if (!input || typeof input !== 'object' || Array.isArray(input)) return {}
    const result: Record<string, string> = {}
    for (const [rawKey, rawValue] of Object.entries(input as Record<string, unknown>).slice(0, 500)) {
      const key = String(rawKey ?? '').trim().slice(0, 200)
      const value = String(rawValue ?? '').trim().slice(0, 2000)
      if (key && value) result[key] = value
    }
    return result
  }

  try {
    const row = db.prepare("SELECT value FROM config WHERE key = 'glossary'").get() as { value?: string } | undefined
    if (row?.value) {
      const glossary = normalize(JSON.parse(String(row.value)))
      for (const [source, target] of Object.entries(glossary)) insert.run(source, target, 'global', '')
    }
  } catch { /* legacy glossary is best effort */ }

  if (hasTable(db, dialect, 'series_profiles')) {
    try {
      const rows = db.prepare('SELECT series_key, glossary_json FROM series_profiles').all() as Array<{ series_key?: string, glossary_json?: string }>
      for (const row of rows) {
        const seriesKey = String(row.series_key || '')
        if (!seriesKey || !row.glossary_json) continue
        const glossary = normalize(JSON.parse(String(row.glossary_json)))
        for (const [source, target] of Object.entries(glossary)) insert.run(source, target, 'series', seriesKey)
      }
    } catch { /* legacy series glossary is best effort */ }
  }

  ensureIndex(db, dialect, 'glossary_entries', 'idx_glossary_entries_scope', 'scope_type, scope_key, enabled')
  ensureIndex(db, dialect, 'glossary_entries', 'idx_glossary_entries_source', 'source')
  ensureIndex(db, dialect, 'glossary_entries', 'idx_glossary_entries_lang', 'source_lang, target_lang')
  ensureIndex(db, dialect, 'glossary_versions', 'idx_glossary_versions_entry', 'entry_id, created_at DESC')
  ensureIndex(db, dialect, 'glossary_imports', 'idx_glossary_imports_created', 'created_at DESC')
}


function ensureReviewVersions(db: any, dialect: MigrationDialect) {
  if (dialect === 'sqlite') {
    db.exec(`
      CREATE TABLE IF NOT EXISTS task_review_versions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        task_id TEXT NOT NULL,
        version_no INTEGER NOT NULL,
        label TEXT NOT NULL DEFAULT '',
        kind TEXT NOT NULL DEFAULT 'manual',
        source TEXT NOT NULL DEFAULT 'system',
        model TEXT,
        provider_type TEXT,
        fingerprint TEXT NOT NULL DEFAULT '',
        settings_json TEXT NOT NULL DEFAULT '{}',
        entries_json TEXT NOT NULL DEFAULT '[]',
        entry_count INTEGER NOT NULL DEFAULT 0,
        edited_count INTEGER NOT NULL DEFAULT 0,
        quality_avg REAL,
        note TEXT,
        created_by TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(task_id, version_no)
      )
    `)
  } else {
    db.exec(`
      CREATE TABLE IF NOT EXISTS task_review_versions (
        id INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
        task_id TEXT NOT NULL,
        version_no INTEGER NOT NULL,
        label TEXT NOT NULL DEFAULT '',
        kind TEXT NOT NULL DEFAULT 'manual',
        source TEXT NOT NULL DEFAULT 'system',
        model TEXT,
        provider_type TEXT,
        fingerprint TEXT NOT NULL DEFAULT '',
        settings_json TEXT NOT NULL DEFAULT '{}',
        entries_json TEXT NOT NULL DEFAULT '[]',
        entry_count INTEGER NOT NULL DEFAULT 0,
        edited_count INTEGER NOT NULL DEFAULT 0,
        quality_avg DOUBLE PRECISION,
        note TEXT,
        created_by TEXT NOT NULL DEFAULT '',
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE(task_id, version_no)
      )
    `)
  }
  ensureIndex(db, dialect, 'task_review_versions', 'idx_task_review_versions_task', 'task_id, created_at DESC')
}


function ensureReviewJobOptions(db: any, dialect: MigrationDialect) {
  if (!hasTable(db, dialect, 'review_jobs')) {
    if (dialect === 'sqlite') {
      db.exec(`
        CREATE TABLE IF NOT EXISTS review_jobs (
          id TEXT PRIMARY KEY,
          task_id TEXT NOT NULL,
          subtitle_ids_json TEXT NOT NULL DEFAULT '[]',
          status TEXT NOT NULL DEFAULT 'queued',
          kind TEXT NOT NULL DEFAULT 'retranslate',
          options_json TEXT NOT NULL DEFAULT '{}',
          version_id INTEGER,
          total INTEGER NOT NULL DEFAULT 0,
          completed INTEGER NOT NULL DEFAULT 0,
          error TEXT,
          result_json TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now')),
          started_at TEXT,
          finished_at TEXT
        )
      `)
    } else {
      db.exec(`
        CREATE TABLE IF NOT EXISTS review_jobs (
          id TEXT PRIMARY KEY,
          task_id TEXT NOT NULL,
          subtitle_ids_json TEXT NOT NULL DEFAULT '[]',
          status TEXT NOT NULL DEFAULT 'queued',
          kind TEXT NOT NULL DEFAULT 'retranslate',
          options_json TEXT NOT NULL DEFAULT '{}',
          version_id INTEGER,
          total INTEGER NOT NULL DEFAULT 0,
          completed INTEGER NOT NULL DEFAULT 0,
          error TEXT,
          result_json TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          started_at TIMESTAMPTZ,
          finished_at TIMESTAMPTZ
        )
      `)
    }
  }
  ensureColumn(db, dialect, 'review_jobs', 'kind', "TEXT NOT NULL DEFAULT 'retranslate'")
  ensureColumn(db, dialect, 'review_jobs', 'options_json', "TEXT NOT NULL DEFAULT '{}'")
  ensureColumn(db, dialect, 'review_jobs', 'version_id', 'INTEGER')
  ensureIndex(db, dialect, 'review_jobs', 'idx_review_jobs_status', 'status, created_at')
  ensureIndex(db, dialect, 'review_jobs', 'idx_review_jobs_task', 'task_id, created_at DESC')
}


function ensureNotificationTemplates(db: any, dialect: MigrationDialect) {
  if (!hasTable(db, dialect, 'notification_deliveries')) {
    if (dialect === 'sqlite') {
      db.exec(`
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
        )
      `)
    } else {
      db.exec(`
        CREATE TABLE IF NOT EXISTS notification_deliveries (
          id INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
          channel_id INTEGER NOT NULL,
          event TEXT NOT NULL,
          title TEXT NOT NULL,
          body TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'pending',
          attempts INTEGER NOT NULL DEFAULT 0,
          max_attempts INTEGER NOT NULL DEFAULT 3,
          next_run_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          last_error TEXT,
          dedupe_key TEXT NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          UNIQUE(dedupe_key)
        )
      `)
    }
  }
  ensureColumn(db, dialect, 'notification_deliveries', 'payload_json', "TEXT NOT NULL DEFAULT '{}'")
  ensureColumn(db, dialect, 'notification_deliveries', 'title_template', "TEXT NOT NULL DEFAULT ''")
  ensureColumn(db, dialect, 'notification_deliveries', 'body_template', "TEXT NOT NULL DEFAULT ''")
  ensureColumn(db, dialect, 'notification_deliveries', 'format', "TEXT NOT NULL DEFAULT 'text'")
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
    version: 4,
    name: 'task-query-indexes',
    up(db, dialect) {
      ensureIndex(db, dialect, 'task_logs', 'idx_task_logs_task_id', 'task_id, id')
      ensureIndex(db, dialect, 'task_responses', 'idx_task_responses_task_chunk', 'task_id, chunk_index')
      ensureIndex(db, dialect, 'integration_events', 'idx_integration_events_dedupe', 'source, event, path, status, created_at')
    }
  },
  {
    version: 5,
    name: 'asr-checkpoints',
    up(db, dialect) {
      ensureAsrCheckpoints(db, dialect)
    }
  },
  {
    version: 6,
    name: 'repair-asr-checkpoint-column',
    up(db, dialect) {
      ensureAsrCheckpoints(db, dialect)
    }
  },
  {
    version: 7,
    name: 'subtitle-style-json',
    up(db, dialect) {
      ensureColumn(db, dialect, 'tasks', 'subtitle_style_json', 'TEXT')
    }
  },
  {
    version: 8,
    name: 'task-timing',
    up(db, dialect) {
      const timestampType = dialect === 'sqlite' ? 'TEXT' : 'TIMESTAMPTZ'
      ensureColumn(db, dialect, 'tasks', 'started_at', timestampType)
      ensureColumn(db, dialect, 'tasks', 'step_started_at', timestampType)
      ensureColumn(db, dialect, 'tasks', 'finished_at', timestampType)
      ensureColumn(db, dialect, 'tasks', 'paused_at', timestampType)
      ensureColumn(db, dialect, 'tasks', 'paused_total_ms', 'INTEGER NOT NULL DEFAULT 0')
      try {
        db.exec("UPDATE tasks SET started_at = created_at WHERE started_at IS NULL AND status <> 'queued'")
        db.exec('UPDATE tasks SET step_started_at = COALESCE(started_at, created_at) WHERE step_started_at IS NULL')
        db.exec("UPDATE tasks SET finished_at = updated_at WHERE finished_at IS NULL AND status IN ('done', 'error', 'cancelled', 'review')")
      } catch {
        // Very old or partially initialized schemas may not have created_at/updated_at yet.
      }
    }
  },
  {
    version: 9,
    name: 'review-jobs',
    up(db, dialect) {
      if (dialect === 'sqlite') {
        db.exec(`
          CREATE TABLE IF NOT EXISTS review_jobs (
            id TEXT PRIMARY KEY,
            task_id TEXT NOT NULL,
            subtitle_ids_json TEXT NOT NULL DEFAULT '[]',
            status TEXT NOT NULL DEFAULT 'queued',
            total INTEGER NOT NULL DEFAULT 0,
            completed INTEGER NOT NULL DEFAULT 0,
            error TEXT,
            result_json TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now')),
            started_at TEXT,
            finished_at TEXT
          )
        `)
      } else {
        db.exec(`
          CREATE TABLE IF NOT EXISTS review_jobs (
            id TEXT PRIMARY KEY,
            task_id TEXT NOT NULL,
            subtitle_ids_json TEXT NOT NULL DEFAULT '[]',
            status TEXT NOT NULL DEFAULT 'queued',
            total INTEGER NOT NULL DEFAULT 0,
            completed INTEGER NOT NULL DEFAULT 0,
            error TEXT,
            result_json TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            started_at TIMESTAMPTZ,
            finished_at TIMESTAMPTZ
          )
        `)
      }
      db.exec('CREATE INDEX IF NOT EXISTS idx_review_jobs_status ON review_jobs(status, created_at)')
      db.exec('CREATE INDEX IF NOT EXISTS idx_review_jobs_task ON review_jobs(task_id, created_at DESC)')
    }
  },
  {
    version: 10,
    name: 'series-profiles',
    up(db, dialect) {
      ensureSeriesProfiles(db, dialect)
    }
  },
  {
    version: 11,
    name: 'coverage-fill-memory-metadata-cost',
    up(db, dialect) {
      ensureIntelligenceTables(db, dialect)
    }
  },
  {
    version: 12,
    name: 'pause-request-and-coverage-snapshots',
    up(db, dialect) {
      ensurePauseRequestAndCoverageSnapshots(db, dialect)
    }
  },
  {
    version: 13,
    name: 'task-batches-and-queue-control',
    up(db, dialect) {
      ensureTaskBatches(db, dialect)
    }
  },
  {
    version: 14,
    name: 'glossary-management',
    up(db, dialect) {
      ensureGlossaryTables(db, dialect)
    }
  },
  {
    version: 15,
    name: 'review-versions',
    up(db, dialect) {
      ensureReviewVersions(db, dialect)
    }
  },
  {
    version: 16,
    name: 'review-job-options',
    up(db, dialect) {
      ensureReviewJobOptions(db, dialect)
    }
  },
  {
    version: 17,
    name: 'notification-templates',
    up(db, dialect) {
      ensureNotificationTemplates(db, dialect)
    }
  },
  {
    version: 18,
    name: 'force-asr-refresh',
    up(db, dialect) {
      ensureColumn(db, dialect, 'tasks', 'force_asr_refresh', 'INTEGER NOT NULL DEFAULT 0')
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
