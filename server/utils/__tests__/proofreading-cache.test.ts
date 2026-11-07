import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

vi.mock('../providers/registry', () => ({
  normalizeProviderType: () => 'openai-compatible',
  createProvider: () => ({
    complete: vi.fn(async () => ({
      content: JSON.stringify({
        terms: [{ source: 'World', target: '世界', reason: '名词' }],
        issues: []
      })
    }))
  })
}))

const tempRoot = mkdtempSync(join(tmpdir(), 'subx-proofread-cache-'))
let db: any
let service: any
let buildFingerprint: any

beforeAll(async () => {
  process.env.DB_PATH = join(tempRoot, 'test.db')
  const dbModule = await import('../db')
  const proofreadModule = await import('../proofreading')
  db = dbModule.useDb()
  db.prepare("INSERT OR REPLACE INTO config (key, value) VALUES ('apiKey', 'test-key')").run()
  service = proofreadModule.ProofreadingService
  buildFingerprint = proofreadModule.buildProofreadFingerprint

  db.prepare("INSERT INTO tasks (task_id, file_path, source_type, model, target_lang, output_mode, status) VALUES ('cache-task', '/tmp/demo.srt', 'external', 'test-model', 'zh-CN', 'translated', 'review')").run()
  const insertEntry = db.prepare(`
    INSERT INTO task_review_entries (task_id, subtitle_id, start_time, end_time, original_text, translated_text, final_text, review_status, sort_order)
    VALUES ('cache-task', ?, ?, ?, ?, ?, ?, 'translated', ?)
  `)
  insertEntry.run('1', '00:00:01,000', '00:00:02,000', 'Hello', '你好', '你好', 0)
  insertEntry.run('2', '00:00:03,000', '00:00:04,000', 'World', '世界', '世界', 1)
})

afterAll(() => {
  try { db?.close?.() } catch { /* ignore */ }
  rmSync(tempRoot, { recursive: true, force: true })
})

describe('proofread cache', () => {
  const rows = [
    { subtitle_id: '1', original_text: 'Hello', translated_text: '你好' },
    { subtitle_id: '2', original_text: 'World', translated_text: '世界' }
  ]

  it('returns cached results and marks stale after subtitle changes', async () => {
    const fingerprint = buildFingerprint({
      kind: 'consistency',
      model: 'test-model',
      providerType: 'openai-compatible',
      apiBaseUrl: 'https://api.openai.com/v1',
      targetLanguage: 'zh-CN',
      totalEntries: 2,
      rows
    })
    db.prepare(`
      INSERT INTO task_proofread_cache (task_id, kind, fingerprint, model, provider_type, entry_count, total_entries, result_json)
      VALUES ('cache-task', 'consistency', ?, 'test-model', 'openai-compatible', 2, 2, ?)
    `).run(fingerprint, JSON.stringify({
      terms: [{ source: 'Hello', target: '你好', reason: '问候语' }],
      issues: [{ subtitleId: '2', type: 'name_inconsistency', message: '译名不一致' }]
    }))

    const cached = await service.getCached('cache-task', 'consistency')
    expect(cached?.cached).toBe(true)
    expect(cached?.stale).toBe(false)
    expect(cached?.terms).toHaveLength(1)
    expect(cached?.issues).toHaveLength(1)
    expect(cached?.entryCount).toBe(2)

    db.prepare("UPDATE task_review_entries SET translated_text = '您好' WHERE task_id = 'cache-task' AND subtitle_id = '1'").run()
    const stale = await service.getCached('cache-task', 'consistency')
    expect(stale?.cached).toBe(true)
    expect(stale?.stale).toBe(true)
  })

  it('removes malformed cache rows', async () => {
    db.prepare(`
      INSERT INTO task_proofread_cache (task_id, kind, fingerprint, model, provider_type, entry_count, total_entries, result_json)
      VALUES ('cache-task', 'glossary', 'bad', 'test-model', 'openai-compatible', 2, 2, 'not-json')
    `).run()
    const cached = await service.getCached('cache-task', 'glossary')
    expect(cached).toBeNull()
    const row = db.prepare("SELECT COUNT(*) AS count FROM task_proofread_cache WHERE task_id = 'cache-task' AND kind = 'glossary'").get()
    expect(Number(row.count)).toBe(0)
  })

  it('writes generated results into the cache', async () => {
    const generated = await service.suggest('cache-task', 'glossary', { force: true })
    expect(generated.cached).toBe(false)
    expect(generated.terms).toHaveLength(1)

    const cached = await service.getCached('cache-task', 'glossary')
    expect(cached?.cached).toBe(true)
    expect(cached?.stale).toBe(false)
    expect(cached?.model).toBe('test-model')
    expect(cached?.terms[0]).toEqual({ source: 'World', target: '世界', reason: '名词' })

    const reused = await service.suggest('cache-task', 'glossary')
    expect(reused.cached).toBe(true)
  })
})
