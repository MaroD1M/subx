import { readFileSync } from 'fs'
import { join } from 'path'
import { newDb } from 'pg-mem'
import { describe, expect, it } from 'vitest'
import { translateSql } from '../pgSync'

describe('PostgreSQL SQL translation', () => {
  it('converts SQLite placeholders and timestamp helpers', () => {
    expect(translateSql("SELECT '?' AS literal, ? AS value, datetime('now') AS now")).toBe("SELECT '?' AS literal, $1 AS value, CURRENT_TIMESTAMP AS now")
    expect(translateSql("SELECT datetime('now', ?)")).toBe('SELECT (CURRENT_TIMESTAMP + $1::interval)')
  })

  it('converts INSERT OR IGNORE and adds RETURNING id for identity tables', () => {
    expect(translateSql('INSERT OR IGNORE INTO watch_events (folder_id, path, dedupe_key) VALUES (?, ?, ?)'))
      .toBe('INSERT INTO watch_events (folder_id, path, dedupe_key) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING RETURNING id')
  })

  it('converts INSERT OR REPLACE for config and translation cache', () => {
    expect(translateSql("INSERT OR REPLACE INTO config (key, value, updated_at) VALUES (?, ?, datetime('now'))"))
      .toBe('INSERT INTO config (key, value, updated_at) VALUES ($1, $2, CURRENT_TIMESTAMP) ON CONFLICT (key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at')
    expect(translateSql('INSERT OR REPLACE INTO translations_cache (hash, original_text) VALUES (?, ?)'))
      .toContain('ON CONFLICT (hash) DO UPDATE SET')
  })
})

describe('PostgreSQL schema compatibility', () => {
  it('runs the schema and core upserts against pg-mem', async () => {
    const db = newDb()
    const pg = db.adapters.createPg()
    const client = new pg.Client()
    await client.connect()
    const schema = readFileSync(join(process.cwd(), 'scripts', 'postgres-schema.sql'), 'utf-8')
    await client.query(schema)

    await client.query(translateSql("INSERT OR REPLACE INTO config (key, value, updated_at) VALUES (?, ?, datetime('now'))"), ['targetLanguage', 'zh-CN'])
    await client.query(translateSql("INSERT OR REPLACE INTO config (key, value, updated_at) VALUES (?, ?, datetime('now'))"), ['targetLanguage', 'ja'])
    const config = await client.query('SELECT value FROM config WHERE key = $1', ['targetLanguage'])
    expect(config.rows[0]?.value).toBe('ja')

    const inserted = await client.query(translateSql('INSERT INTO notification_channels (type, name, config_json) VALUES (?, ?, ?)'), ['ntfy', 'Test', '{}'])
    expect(inserted.rows[0]?.id).toBe(1)

    await client.query(translateSql('INSERT OR IGNORE INTO watch_events (folder_id, path, dedupe_key) VALUES (?, ?, ?)'), [1, 'A.mkv', 'key-1'])
    await client.query(translateSql('INSERT OR IGNORE INTO watch_events (folder_id, path, dedupe_key) VALUES (?, ?, ?)'), [1, 'A.mkv', 'key-1'])
    const events = await client.query('SELECT COUNT(*)::int AS count FROM watch_events')
    expect(events.rows[0]?.count).toBe(1)

    await client.end()
  })
})
