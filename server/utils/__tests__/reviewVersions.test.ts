import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

const tempRoot = mkdtempSync(join(tmpdir(), 'subx-review-versions-'))
let db: any
let ReviewVersionService: typeof import('../reviewVersions').ReviewVersionService

beforeAll(async () => {
  process.env.DB_PATH = join(tempRoot, 'test.db')
  db = (await import('../db')).useDb()
  ReviewVersionService = (await import('../reviewVersions')).ReviewVersionService
  db.prepare("INSERT INTO tasks (task_id, file_path, model, status, subtitle_format, subtitle_style_preset, bilingual_layout) VALUES ('version-task', '/tmp/demo.srt', 'm', 'review', 'srt', 'bilingual_simple', 'translated_first')").run()
  for (const [id, text] of [['1', 'Hello'], ['2', 'World']]) {
    db.prepare(`
      INSERT INTO task_review_entries (task_id, subtitle_id, start_time, end_time, original_text, translated_text, final_text, review_status, review_reasons, quality_issues, sort_order)
      VALUES ('version-task', ?, '00:00:01,000', '00:00:02,000', ?, ?, ?, 'translated', '[]', '[]', ?)
    `).run(id, text, `${text} 译`, `${text} 译`, Number(id) - 1)
  }
})

afterAll(() => {
  try { db?.close?.() } catch { /* ignore */ }
  rmSync(tempRoot, { recursive: true, force: true })
})

describe('review versions', () => {
  it('creates a snapshot and restores it', () => {
    const initial = ReviewVersionService.snapshot('version-task', { kind: 'initial', label: '初始' })!
    expect(initial.entryCount).toBe(2)
    db.prepare("UPDATE task_review_entries SET final_text = 'Changed' WHERE task_id = 'version-task' AND subtitle_id = '1'").run()
    db.prepare("INSERT INTO task_review_entries (task_id, subtitle_id, start_time, end_time, original_text, translated_text, final_text, review_status, review_reasons, quality_issues, sort_order) VALUES ('version-task', '3', '00:00:03,000', '00:00:04,000', 'New', 'New 译', 'New 译', 'translated', '[]', '[]', 2)").run()

    const result = ReviewVersionService.apply('version-task', initial.id)
    expect(result.applied).toBe(2)
    expect(db.prepare("SELECT COUNT(*) AS count FROM task_review_entries WHERE task_id = 'version-task'").get()).toEqual({ count: 2 })
    expect(db.prepare("SELECT final_text FROM task_review_entries WHERE task_id = 'version-task' AND subtitle_id = '1'").get()).toEqual({ final_text: 'Hello 译' })
    expect(ReviewVersionService.list('version-task').some(version => version.kind === 'rollback')).toBe(true)
  })

  it('creates an A/B style snapshot from translated entries without touching the work area', () => {
    const version = ReviewVersionService.snapshotWithTranslations('version-task', [
      { subtitleId: '1', translatedText: '你好', finalText: '你好', reviewStatus: 'translated' }
    ], { kind: 'ab', label: 'A/B test', model: 'model-b' })!
    expect(version.kind).toBe('ab')
    expect(version.model).toBe('model-b')
    expect(db.prepare("SELECT final_text FROM task_review_entries WHERE task_id = 'version-task' AND subtitle_id = '1'").get()).toEqual({ final_text: 'Hello 译' })
    const full = ReviewVersionService.get('version-task', version.id)!
    expect(full.entries.find(entry => entry.subtitleId === '1')?.finalText).toBe('你好')
  })
})
