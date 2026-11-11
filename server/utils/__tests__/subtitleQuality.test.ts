import { describe, expect, it } from 'vitest'
import { analyzeSubtitleQuality } from '../subtitleQuality'

function entry(id: string, startTime: string, endTime: string, translatedText: string, text = 'source'): any {
  return { id, startTime, endTime, text, translatedText }
}

describe('subtitle quality', () => {
  it('detects long lines, high cps, overlaps and short durations', () => {
    const result = analyzeSubtitleQuality([
      entry('1', '00:00:01,000', '00:00:01,300', '这是一个非常非常非常非常非常非常长的字幕行，应该被技术质检标记为过长'),
      entry('2', '00:00:01,200', '00:00:02,000', '短句')
    ])
    const reasons = new Set(result.issues.map(issue => issue.reason))
    expect(reasons.has('line_too_long')).toBe(true)
    expect(reasons.has('cps_too_high')).toBe(true)
    expect(reasons.has('duration_too_short')).toBe(true)
    expect(reasons.has('timing_overlap')).toBe(true)
  })

  it('wraps overlong lines without losing text when auto fix is enabled', () => {
    const input = [entry('1', '00:00:01,000', '00:00:04,000', '第一段很长的文字需要自动换行第二段也很长需要换行')]
    const result = analyzeSubtitleQuality(input, { maxCharsPerLine: 8, maxLines: 4 }, true)
    expect(result.entries[0]!.translatedText).toContain('\n')
    expect(result.autoFixed).toBe(1)
  })

  it('does not flag a clean cue', () => {
    const result = analyzeSubtitleQuality([
      entry('1', '00:00:01,000', '00:00:03,000', '你好世界')
    ])
    expect(result.issues).toHaveLength(0)
  })
})
