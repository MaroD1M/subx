import { describe, expect, it } from 'vitest'
import { buildChineseVariantEntries, buildChineseVariantPaths, chineseVariantTarget, convertChineseText } from '../chineseVariant'

describe('chinese variant output', () => {
  it('maps target languages to the alternate variant', () => {
    expect(chineseVariantTarget('zh-CN')).toBe('zh-TW')
    expect(chineseVariantTarget('zh-TW')).toBe('zh-CN')
    expect(chineseVariantTarget('en')).toBeNull()
  })

  it('converts translated text only', () => {
    const entries = buildChineseVariantEntries([
      { id: '1', startTime: '00:00:01,000', endTime: '00:00:02,000', text: 'original', translatedText: '简体中文' }
    ], 'zh-CN')
    expect(entries[0]!.text).toBe('original')
    expect(entries[0]!.translatedText).not.toBe('简体中文')
    expect(convertChineseText('简体中文', 'zh-CN')).toBe(entries[0]!.translatedText)
  })

  it('builds sidecar and Emby variant paths', () => {
    expect(buildChineseVariantPaths('/media/Show.zh-CN.srt', '', 'zh-CN')).toEqual(['/media/Show.zh-TW.srt'])
    expect(buildChineseVariantPaths('/media/Show.srt', '/media/SubX/Show.zh-CN.srt', 'zh-CN')).toEqual(['/media/SubX/Show.zh-TW.srt'])
  })
})
