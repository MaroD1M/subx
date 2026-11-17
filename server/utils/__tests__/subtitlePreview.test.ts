import { describe, expect, it } from 'vitest'
import { mergePreviewEntries } from '../subtitlePreview'
import type { SubtitleEntry } from '../../../types'

function entry(id: string, startTime: string, endTime: string, text: string): SubtitleEntry {
  return { id, startTime, endTime, text }
}

describe('subtitle preview entries', () => {
  it('merges bilingual cues that share the same timing', () => {
    const merged = mergePreviewEntries([
      entry('1', '00:00:14,640', '00:00:16,000', '还要几次？'),
      entry('2', '00:00:14,640', '00:00:16,000', 'How many more times?'),
      entry('3', '00:00:16,880', '00:00:18,000', '再两次就够了')
    ])

    expect(merged).toHaveLength(2)
    expect(merged[0]!.text).toBe('还要几次？\nHow many more times?')
    expect(merged[0]!.id).toBe('1')
    expect(merged[1]!.id).toBe('2')
  })

  it('keeps separate cues and removes duplicate text within a merged cue', () => {
    const merged = mergePreviewEntries([
      entry('1', '00:00:01,000', '00:00:02,000', '同一句'),
      entry('2', '00:00:01,000', '00:00:02,000', '同一句'),
      entry('3', '00:00:03,000', '00:00:04,000', '下一句')
    ])

    expect(merged).toHaveLength(2)
    expect(merged[0]!.text).toBe('同一句')
    expect(merged[1]!.text).toBe('下一句')
  })
})
