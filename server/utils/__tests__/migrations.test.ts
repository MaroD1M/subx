import { describe, expect, it } from 'vitest'
import Database from 'better-sqlite3'
import { MIGRATIONS, runMigrations } from '../migrations'

function columnNames(db: Database.Database, table: string) {
  return (db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>).map(row => row.name)
}

describe('database migrations', () => {
  it('upgrades an old sqlite schema and is idempotent', () => {
    const db = new Database(':memory:')
    db.exec(`
      CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT (datetime('now')));
      CREATE TABLE tasks (task_id TEXT PRIMARY KEY, file_path TEXT NOT NULL, model TEXT NOT NULL);
      CREATE TABLE task_responses (id INTEGER PRIMARY KEY AUTOINCREMENT, task_id TEXT NOT NULL);
      CREATE TABLE task_logs (id INTEGER PRIMARY KEY AUTOINCREMENT, task_id TEXT NOT NULL, message TEXT NOT NULL);
      CREATE TABLE task_review_entries (id INTEGER PRIMARY KEY AUTOINCREMENT, task_id TEXT NOT NULL, subtitle_id TEXT NOT NULL);
    `)
    db.prepare('INSERT INTO schema_migrations (version) VALUES (1)').run()
    db.prepare('INSERT INTO schema_migrations (version) VALUES (2)').run()
    db.prepare("INSERT INTO task_review_entries (task_id, subtitle_id) VALUES ('task-1', '12')").run()

    runMigrations(db, 'sqlite')

    expect(columnNames(db, 'tasks')).toEqual(expect.arrayContaining(['translation_mode', 'step_progress', 'track_policy_json']))
    expect(columnNames(db, 'task_responses')).toEqual(expect.arrayContaining(['prompt_tokens', 'total_tokens']))
    expect(columnNames(db, 'task_logs')).toContain('category')
    expect(columnNames(db, 'task_review_entries')).toEqual(expect.arrayContaining(['sort_order', 'quality_score', 'quality_issues']))
    expect(columnNames(db, 'task_proofread_cache')).toEqual(expect.arrayContaining(['fingerprint', 'result_json']))
    expect(db.prepare("SELECT sort_order FROM task_review_entries WHERE subtitle_id = '12'").get()).toEqual({ sort_order: 12 })
    expect(db.prepare('SELECT version FROM schema_migrations ORDER BY version').all()).toEqual([{ version: 1 }, { version: 2 }, { version: 3 }, { version: 4 }])
    expect(db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name='idx_task_logs_task_id'").get()).toBeTruthy()
    expect(db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name='idx_task_responses_task_chunk'").get()).toBeTruthy()

    expect(() => runMigrations(db, 'sqlite')).not.toThrow()
    expect(MIGRATIONS.some(migration => migration.version === 3)).toBe(true)
    expect(MIGRATIONS.some(migration => migration.version === 4)).toBe(true)
    db.close()
  })

  it('does not rewrite valid sort orders during the one-time backfill', () => {
    const db = new Database(':memory:')
    db.exec(`
      CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT (datetime('now')));
      CREATE TABLE tasks (task_id TEXT PRIMARY KEY, file_path TEXT NOT NULL, model TEXT NOT NULL);
      CREATE TABLE task_responses (id INTEGER PRIMARY KEY AUTOINCREMENT, task_id TEXT NOT NULL);
      CREATE TABLE task_logs (id INTEGER PRIMARY KEY AUTOINCREMENT, task_id TEXT NOT NULL, message TEXT NOT NULL);
      CREATE TABLE task_review_entries (id INTEGER PRIMARY KEY AUTOINCREMENT, task_id TEXT NOT NULL, subtitle_id TEXT NOT NULL, sort_order INTEGER NOT NULL DEFAULT 0);
    `)
    db.prepare('INSERT INTO schema_migrations (version) VALUES (1)').run()
    db.prepare('INSERT INTO schema_migrations (version) VALUES (2)').run()
    db.prepare("INSERT INTO task_review_entries (task_id, subtitle_id, sort_order) VALUES ('task-1', '99', 0)").run()
    db.prepare("INSERT INTO task_review_entries (task_id, subtitle_id, sort_order) VALUES ('task-1', '100', 1)").run()

    runMigrations(db, 'sqlite')

    expect(db.prepare("SELECT sort_order FROM task_review_entries WHERE subtitle_id = '99'").get()).toEqual({ sort_order: 0 })
    db.close()
  })
})
