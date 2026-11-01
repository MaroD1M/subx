import { describe, expect, it } from 'vitest'
import { buildProductionContext, parseAiTranslations } from '../translation'

describe('TranslationService parser', () => {
  it('parses json object payloads first when text format is absent', () => {
    const parsed = parseAiTranslations(JSON.stringify({
      items: [
        { id: '1', translatedText: '你好' },
        { id: '2', translatedText: '世界' }
      ]
    }), ['1', '2'])

    expect(Array.from(parsed.entries())).toEqual([
      ['1', '你好'],
      ['2', '世界']
    ])
  })

  it('prefers text format when text and json coexist', () => {
    const parsed = parseAiTranslations(`1\n文本优先\n\n{"items":[{"id":"1","translatedText":"JSON结果"}]}`, ['1'])
    expect(parsed.get('1')).toBe('文本优先')
  })

  it('parses fenced json payloads', () => {
    const parsed = parseAiTranslations('```json\n{"items":[{"id":"3","translatedText":"再见"}]}\n```', ['3'])
    expect(parsed.get('3')).toBe('再见')
  })

  it('falls back to legacy text format when json is unavailable', () => {
    const parsed = parseAiTranslations('1\n你好\n\n2\n世界', ['1', '2'])
    expect(Array.from(parsed.entries())).toEqual([
      ['1', '你好'],
      ['2', '世界']
    ])
  })

  it('ignores unexpected ids in json payloads', () => {
    const parsed = parseAiTranslations(JSON.stringify([
      { id: '1', translatedText: '你好' },
      { id: '9', translatedText: '异常' }
    ]), ['1'])

    expect(Array.from(parsed.entries())).toEqual([
      ['1', '你好']
    ])
  })

  it('falls back to positional matching when text and json both fail', () => {
    const parsed = parseAiTranslations('你好\n世界\n测试', ['1', '2', '3'])
    expect(Array.from(parsed.entries())).toEqual([
      ['1', '你好'],
      ['2', '世界'],
      ['3', '测试']
    ])
  })

  it('handles json with unquoted keys via repair', () => {
    const parsed = parseAiTranslations('{items:[{id:"1",translatedText:"你好"},{id:"2",translatedText:"世界"}]}', ['1', '2'])
    expect(Array.from(parsed.entries())).toEqual([
      ['1', '你好'],
      ['2', '世界']
    ])
  })

  it('handles json with trailing commas via repair', () => {
    const parsed = parseAiTranslations('{"items":[{"id":"1","translatedText":"你好",},{"id":"2","translatedText":"世界",}]}', ['1', '2'])
    expect(Array.from(parsed.entries())).toEqual([
      ['1', '你好'],
      ['2', '世界']
    ])
  })

  it('does not positionally assign when line count is ambiguous', () => {
    const parsed = parseAiTranslations('你好\n世界', ['1', '2', '3'])
    expect(parsed.size).toBe(0)
  })


  it('builds production context from title, background and instructions', () => {
    const context = buildProductionContext({
      title: 'Demo Show S01E01',
      background: '主角在北境遇到守夜人',
      instructions: '角色名保持与术语表一致'
    })
    expect(context).toContain('作品名称：Demo Show S01E01')
    expect(context).toContain('剧情背景：主角在北境遇到守夜人')
    expect(context).toContain('额外翻译要求：角色名保持与术语表一致')
  })

})
