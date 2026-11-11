import { describe, expect, it } from 'vitest'
import { mergeOcrHealth } from '../ocr/status'

describe('mergeOcrHealth', () => {
  it('reports the configured language instead of the service default', () => {
    const merged = mergeOcrHealth(
      { ocrLanguage: 'zh-CN', ocrEngine: 'rapidocr' },
      { engine: 'auto', language: 'en', maxSeconds: 14400 }
    )

    expect(merged).toMatchObject({
      language: 'zh-CN',
      serviceLanguage: 'en',
      engine: 'rapidocr',
      serviceEngine: 'auto',
      maxSeconds: 14400
    })
  })

  it('keeps the resolved engine when the configuration uses auto', () => {
    const merged = mergeOcrHealth(
      { ocrLanguage: 'ja', ocrEngine: 'auto' },
      { engine: 'tesseract', language: 'en' }
    )

    expect(merged).toMatchObject({ language: 'ja', engine: 'tesseract' })
  })

  it('returns non-object health payloads unchanged', () => {
    expect(mergeOcrHealth({ ocrLanguage: 'en', ocrEngine: 'auto' }, null)).toBeNull()
    expect(mergeOcrHealth({ ocrLanguage: 'en', ocrEngine: 'auto' }, 'bad gateway')).toBe('bad gateway')
  })
})
