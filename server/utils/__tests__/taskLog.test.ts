import { describe, expect, it } from 'vitest'
import { resolveTaskLogCategory } from '../taskLog'

describe('task log category classification', () => {
  it('does not treat JSON keys such as pgsError as errors', () => {
    expect(resolveTaskLogCategory('ocr', 'info', '[OCR] {"pgsError":"PGS OCR 未生成 SRT","segments":818}')).toBe('system')
  })

  it('still treats real error messages as errors', () => {
    expect(resolveTaskLogCategory('ocr', 'error', 'OCR 失败')).toBe('error')
    expect(resolveTaskLogCategory('translating', 'info', 'fetch failed')).toBe('error')
    expect(resolveTaskLogCategory('translating', 'info', 'block failure detected')).toBe('error')
  })

  it('keeps normal OCR diagnostics in system/process categories', () => {
    expect(resolveTaskLogCategory('ocr', 'info', '[OCR] {"segments":818}')).toBe('system')
    expect(resolveTaskLogCategory('translating', 'info', '块 #3 校验完成')).toBe('translation')
  })
})
