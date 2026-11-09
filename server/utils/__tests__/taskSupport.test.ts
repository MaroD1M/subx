import Database from 'better-sqlite3'
import { describe, expect, it, vi } from 'vitest'
import { analyzeChunkRisk, expandRetryEntries, persistReviewEntries } from '../taskSupport'
import type { SubtitleEntry } from '../../../types'

const dbHolder = vi.hoisted(() => ({ db: null as any }))
vi.mock('../db', () => ({ useDb: () => dbHolder.db }))

function entry(id: string, text: string): SubtitleEntry {
  return { id, startTime: '00:00:01,000', endTime: '00:00:02,000', text }
}

describe('task support', () => {
  it('rolls back review persistence when any row fails', () => {
    const db = new Database(':memory:')
    db.exec(`
      CREATE TABLE task_review_entries (
        task_id TEXT NOT NULL, subtitle_id TEXT NOT NULL, start_time TEXT NOT NULL, end_time TEXT NOT NULL,
        original_text TEXT NOT NULL, translated_text TEXT, final_text TEXT, review_status TEXT NOT NULL DEFAULT 'translated',
        review_reasons TEXT NOT NULL DEFAULT '[]', asr_confidence REAL, quality_score REAL, quality_issues TEXT NOT NULL DEFAULT '[]',
        sort_order INTEGER NOT NULL DEFAULT 0, selected INTEGER NOT NULL DEFAULT 0, edited INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(task_id, subtitle_id)
      );
      CREATE TRIGGER fail_second BEFORE INSERT ON task_review_entries WHEN NEW.subtitle_id = '2'
      BEGIN SELECT RAISE(ABORT, 'boom'); END;
    `)
    dbHolder.db = db
    try {
      expect(() => persistReviewEntries('task-1', [entry('1', 'one'), entry('2', 'two')], [])).toThrow('boom')
      expect((db.prepare('SELECT COUNT(*) AS count FROM task_review_entries').get() as any).count).toBe(0)
    } finally {
      db.close()
      dbHolder.db = null
    }
  })
  it('expands retry targets to neighbours and contiguous ranges', () => {
    const entries = ['1', '2', '3', '4', '5'].map(id => entry(id, `line ${id}`))

    expect(expandRetryEntries(entries, ['2']).map(item => item.id)).toEqual(['1', '2', '3'])
    expect(expandRetryEntries(entries, ['2', '3']).map(item => item.id)).toEqual(['1', '2', '3', '4'])
    expect(expandRetryEntries(entries, [])).toBe(entries)
  })

  it('detects chunk risks used by translation prompts', () => {
    const risk = analyzeChunkRisk([
      entry('1', '__SUBX_FMT_1__你好，world'),
      entry('2', '第一行中文\nsecond line\n第三行'),
      entry('3', '[sirens wailing]'),
      entry('4', 'x'.repeat(130))
    ])

    expect(risk.tags).toEqual(expect.arrayContaining([
      'formatting_tokens',
      'bilingual_source',
      'multi_line_dialogue',
      'non_dialogue',
      'long_text'
    ]))
    expect(risk.stylePromptSuffix).toContain('__SUBX_FMT_n__')
  })
})
