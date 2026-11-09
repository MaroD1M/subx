import { readFileSync } from 'fs'
import { join } from 'path'
import { afterAll, describe, expect, it } from 'vitest'
import { PgDatabase, translateSql } from '../pgSync'
import { runMigrations } from '../migrations'

const databaseUrl = process.env.PG_TEST_DATABASE_URL
const allowReset = process.env.PG_TEST_ALLOW_RESET === '1'
const live = databaseUrl && allowReset ? describe : describe.skip

live('live PostgreSQL bridge', () => {
  const db = new PgDatabase(databaseUrl!)

  afterAll(() => {
    db.close()
  })

  it('creates schema and supports SQLite-style upserts', () => {
    db.exec('DROP SCHEMA public CASCADE; CREATE SCHEMA public;')
    db.exec(readFileSync(join(process.cwd(), 'scripts', 'postgres-schema.sql'), 'utf-8'))

    db.prepare(translateSql("INSERT OR REPLACE INTO config (key, value, updated_at) VALUES (?, ?, datetime('now'))")).run('targetLanguage', 'zh-CN')
    db.prepare(translateSql("INSERT OR REPLACE INTO config (key, value, updated_at) VALUES (?, ?, datetime('now'))")).run('targetLanguage', 'ja')
    expect(db.prepare('SELECT value FROM config WHERE key = ?').get('targetLanguage')?.value).toBe('ja')

    const inserted = db.prepare('INSERT INTO notification_channels (type, name, config_json) VALUES (?, ?, ?)').run('ntfy', 'Test', '{}')
    expect(inserted.lastInsertRowid).toBeGreaterThan(0)

    const first = db.prepare(translateSql('INSERT OR IGNORE INTO watch_events (folder_id, path, dedupe_key) VALUES (?, ?, ?)')).run(1, 'Movie.mkv', 'dedupe-1')
    const second = db.prepare(translateSql('INSERT OR IGNORE INTO watch_events (folder_id, path, dedupe_key) VALUES (?, ?, ?)')).run(1, 'Movie.mkv', 'dedupe-1')
    expect(first.changes).toBe(1)
    expect(second.changes).toBe(0)

    db.prepare("INSERT INTO task_jobs (task_id, status, next_run_at) VALUES (?, 'queued', datetime('now', ?))").run('task-1', '-1 minutes')
    const job = db.prepare('SELECT status FROM task_jobs WHERE task_id = ?').get('task-1')
    expect(job?.status).toBe('queued')
  })


  it('serializes concurrent migrations with an advisory lock', async () => {
    const a = new PgDatabase(databaseUrl!)
    const b = new PgDatabase(databaseUrl!)
    try {
      a.exec('DROP SCHEMA public CASCADE; CREATE SCHEMA public;')
      a.exec(readFileSync(join(process.cwd(), 'scripts', 'postgres-schema.sql'), 'utf-8'))
      a.prepare('INSERT OR IGNORE INTO schema_migrations (version) VALUES (1)').run()
      a.prepare('INSERT OR IGNORE INTO schema_migrations (version) VALUES (2)').run()

      await Promise.all([
        Promise.resolve().then(() => runMigrations(a, 'postgres')),
        Promise.resolve().then(() => runMigrations(b, 'postgres'))
      ])

      const versions = a.prepare('SELECT version FROM schema_migrations ORDER BY version').all()
        .map((row: any) => Number(row.version))
      expect(versions).toEqual([1, 2, 3, 4, 5, 6])
    } finally {
      a.close()
      b.close()
    }
  })
  it('keeps transaction queries on one connection', () => {
    db.exec('BEGIN')
    db.prepare(translateSql("INSERT OR REPLACE INTO config (key, value, updated_at) VALUES (?, ?, datetime('now'))")).run('tx-test', 'value')
    expect(db.prepare('SELECT value FROM config WHERE key = ?').get('tx-test')?.value).toBe('value')
    db.exec('ROLLBACK')
    expect(db.prepare('SELECT value FROM config WHERE key = ?').get('tx-test')).toBeUndefined()
  })
})
