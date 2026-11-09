export const SQLITE_SCHEMA_SQL = `    CREATE TABLE IF NOT EXISTS config (
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
      asr_checkpoint_key TEXT,
      origin TEXT NOT NULL DEFAULT 'manual',
      watch_event_id INTEGER,
      content_title TEXT,
      content_background TEXT,
      custom_instructions TEXT,
      translation_mode TEXT NOT NULL DEFAULT 'non_stream',
      subtitle_format TEXT NOT NULL DEFAULT 'srt',
      subtitle_style_preset TEXT NOT NULL DEFAULT 'bilingual_simple',
      subtitle_style_json TEXT,
      bilingual_layout TEXT NOT NULL DEFAULT 'translated_first',
      force_retranslate INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'queued',
      progress INTEGER NOT NULL DEFAULT 0,
      step_progress INTEGER NOT NULL DEFAULT 0,
      step_message TEXT,
      track_policy_json TEXT NOT NULL DEFAULT '{}',
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
    );

    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    );`
