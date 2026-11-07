import { describe, expect, it } from 'vitest'
import { buildProofreadFingerprint, hasParsableProofreadResponse, parseProofreadResponse, sampleProofreadRows } from '../proofreading'

describe('proofreading parsing', () => {
  it('parses glossary terms and issues from fenced JSON', () => {
    const result = parseProofreadResponse('```json\n{"terms":[{"source":"Jon Snow","target":"琼恩·雪诺","reason":"人名"}],"issues":[{"subtitleId":"3","type":"name_inconsistency","message":"译名不一致"}]}\n```')
    expect(result.terms[0]).toEqual({ source: 'Jon Snow', target: '琼恩·雪诺', reason: '人名' })
    expect(result.issues[0]?.subtitleId).toBe('3')
  })

  it('drops incomplete entries', () => {
    const result = parseProofreadResponse('{"terms":[{"source":"A"}],"issues":[{"id":"2"}]}')
    expect(result.terms).toHaveLength(0)
    expect(result.issues).toHaveLength(0)
  })

  it('returns empty for malformed output', () => {
    expect(parseProofreadResponse('nope')).toEqual({ terms: [], issues: [] })
    expect(hasParsableProofreadResponse('nope')).toBe(false)
    expect(hasParsableProofreadResponse('{"terms":[],"issues":[]}')).toBe(true)
  })

  it('deduplicates identical terms and issues', () => {
    const result = parseProofreadResponse(JSON.stringify({
      terms: [
        { source: 'Jon Snow', target: '琼恩·雪诺' },
        { source: 'Jon Snow', target: '琼恩·雪诺' }
      ],
      issues: [
        { subtitleId: '3', type: 'name_inconsistency', message: '译名不一致' },
        { subtitleId: '3', type: 'name_inconsistency', message: '译名不一致' }
      ]
    }))
    expect(result.terms).toHaveLength(1)
    expect(result.issues).toHaveLength(1)
  })
})


describe('proofreading cache fingerprint', () => {
  const rows = [
    { subtitle_id: '1', original_text: 'Hello', translated_text: '你好' },
    { subtitle_id: '2', original_text: 'World', translated_text: '世界' }
  ]

  it('is stable for identical sampled content', () => {
    const first = buildProofreadFingerprint({ kind: 'consistency', model: 'model-a', providerType: 'openai-compatible', targetLanguage: 'zh-CN', totalEntries: 2, rows })
    const second = buildProofreadFingerprint({ kind: 'consistency', model: 'model-a', providerType: 'openai-compatible', targetLanguage: 'zh-CN', totalEntries: 2, rows })
    expect(first).toBe(second)
  })

  it('changes when subtitles, model, kind or language change', () => {
    const base = { kind: 'consistency' as const, model: 'model-a', providerType: 'openai-compatible', targetLanguage: 'zh-CN', totalEntries: 2, rows }
    const fingerprint = buildProofreadFingerprint(base)
    expect(buildProofreadFingerprint({ ...base, rows: [{ ...rows[0]!, translated_text: '您好' }, rows[1]!] })).not.toBe(fingerprint)
    expect(buildProofreadFingerprint({ ...base, model: 'model-b' })).not.toBe(fingerprint)
    expect(buildProofreadFingerprint({ ...base, kind: 'glossary' })).not.toBe(fingerprint)
    expect(buildProofreadFingerprint({ ...base, targetLanguage: 'ja-JP' })).not.toBe(fingerprint)
  })

  it('samples long tasks deterministically', () => {
    const longRows = Array.from({ length: 500 }, (_, index) => index)
    const first = sampleProofreadRows(longRows, 10)
    const second = sampleProofreadRows(longRows, 10)
    expect(first).toEqual(second)
    expect(first).toHaveLength(10)
    expect(first[0]).toBe(0)
  })
})
