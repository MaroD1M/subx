import { describe, expect, it } from 'vitest'
import { reviewExportSchema, reviewPatchSchema, taskCreateSchema } from '../validation'

describe('task request validation', () => {
  it('accepts normal language tags', () => {
    expect(taskCreateSchema.safeParse({ targetLanguage: 'zh-CN' }).success).toBe(true)
    expect(taskCreateSchema.safeParse({ targetLanguage: 'pt_BR' }).success).toBe(true)
  })

  it('rejects path-like language tags', () => {
    expect(taskCreateSchema.safeParse({ targetLanguage: '../../tmp/pwn' }).success).toBe(false)
    expect(taskCreateSchema.safeParse({ targetLanguage: 'zh/../../x' }).success).toBe(false)
  })

  it('restricts review export formats', () => {
    expect(reviewExportSchema.safeParse({ subtitleFormat: 'srt' }).success).toBe(true)
    expect(reviewExportSchema.safeParse({ subtitleFormat: 'ass' }).success).toBe(true)
    expect(reviewExportSchema.safeParse({ subtitleFormat: '../../x' }).success).toBe(false)
  })

  it('accepts valid review timing edits and rejects malformed times', () => {
    expect(reviewPatchSchema.safeParse({ entries: [{ subtitleId: '1', startTime: '00:00:01,200', endTime: '00:00:03.500' }] }).success).toBe(true)
    expect(reviewPatchSchema.safeParse({ entries: [{ subtitleId: '1', startTime: '00:00:03,000', endTime: '00:00:02,000' }] }).success).toBe(true)
    expect(reviewPatchSchema.safeParse({ entries: [{ subtitleId: '1', startTime: 'bad-time' }] }).success).toBe(false)
    expect(reviewPatchSchema.safeParse({ entries: [{ subtitleId: '1', endTime: '00:99:00,000' }] }).success).toBe(false)
  })
})
