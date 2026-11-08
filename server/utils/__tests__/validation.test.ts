import { describe, expect, it } from 'vitest'
import { reviewExportSchema, taskCreateSchema } from '../validation'

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
})
