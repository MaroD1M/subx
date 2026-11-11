import { readFileSync } from 'fs'
import { join } from 'path'
import { newDb } from 'pg-mem'
import { describe, expect, it } from 'vitest'
import { translateSql } from '../pgSync'

describe('PostgreSQL SQL translation', () => {
  it('converts SQLite placeholders and timestamp helpers', () => {
    expect(translateSql("SELECT '?' AS literal, ? AS value, datetime('now') AS now")).toBe("SELECT '?' AS literal, $1 AS value, CURRENT_TIMESTAMP AS now")
    expect(translateSql("SELECT datetime('now', ?)")).toBe('SELECT (CURRENT_TIMESTAMP + $1::interval)')
    expect(translateSql("SELECT datetime('now', '+7 days')")).toBe("SELECT (CURRENT_TIMESTAMP + '+7 days'::interval)")
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

  it('supports the coverage, memory, metadata and cost tables', async () => {
    const db = newDb()
    const pg = db.adapters.createPg()
    const client = new pg.Client()
    await client.connect()
    const schema = readFileSync(join(process.cwd(), 'scripts', 'postgres-schema.sql'), 'utf-8')
    await client.query(schema)

    await client.query(`
      INSERT INTO coverage_auto_fill_policies (root_id, enabled, target_language, schedule_type, output_policy_json)
      VALUES ('root-1', 1, 'zh-CN', 'daily', '{}')
      ON CONFLICT(root_id) DO UPDATE SET enabled=excluded.enabled
    `)
    await client.query(`
      INSERT INTO library_coverage_index (root_id, target_language, path, status)
      VALUES ('root-1', 'zh-CN', 'Show.S01E01.mkv', 'missing')
      ON CONFLICT(root_id, target_language, path) DO UPDATE SET status=excluded.status
    `)
    await client.query(`
      INSERT INTO translation_memory (target_language, source_hash, source_text, translated_text, series_key, confidence)
      VALUES ('zh-CN', 'hash-1', 'Hello world', '你好世界', 'series-1', 0.9)
      ON CONFLICT(target_language, source_hash, series_key) DO UPDATE SET translated_text=excluded.translated_text
    `)
    await client.query(`
      INSERT INTO media_metadata_cache (cache_key, payload_json, expires_at)
      VALUES ('tmdb:test', '{}', now())
      ON CONFLICT(cache_key) DO UPDATE SET payload_json=excluded.payload_json
    `)
    await client.query(`
      INSERT INTO cost_usage (task_id, model, prompt_tokens, completion_tokens, total_tokens, cost_usd)
      VALUES ('task-1', 'model-a', 10, 20, 30, 0.001)
      ON CONFLICT(task_id) DO UPDATE SET cost_usd=excluded.cost_usd
    `)
    const memory = await client.query('SELECT COUNT(*)::int AS count FROM translation_memory')
    expect(memory.rows[0]?.count).toBe(1)
    const costs = await client.query("SELECT COALESCE(SUM(cost_usd), 0) AS total FROM cost_usage")
    expect(Number(costs.rows[0]?.total)).toBeCloseTo(0.001)
    const monthly = await client.query('SELECT COUNT(*)::int AS count FROM cost_usage WHERE created_at >= $1 AND created_at < $2', ['2026-01-01 00:00:00', '2026-12-31 00:00:00'])
    expect(monthly.rows[0]?.count).toBe(1)
    await client.end()
  })
})
