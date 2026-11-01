import { readFileSync } from 'fs'
import { join } from 'path'
import { afterAll, describe, expect, it } from 'vitest'
import { PgDatabase, translateSql } from '../pgSync'

const databaseUrl = process.env.PG_TEST_DATABASE_URL
const live = databaseUrl ? describe : describe.skip

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
})
