import { describe, expect, it } from 'vitest'
import { analyzeChunkRisk, expandRetryEntries } from '../taskSupport'
import type { SubtitleEntry } from '../../../types'

function entry(id: string, text: string): SubtitleEntry {
  return { id, startTime: '00:00:01,000', endTime: '00:00:02,000', text }
}

describe('task support', () => {
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
