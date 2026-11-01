import { describe, expect, it } from 'vitest'
import { parseQualityResponse } from '../quality'

describe('quality review parsing', () => {
  it('parses fenced JSON scores and normalizes issue tags', () => {
    const parsed = parseQualityResponse('```json\n{"items":[{"id":"2","score":0.42,"issues":["mistranslation","other","bad"]},{"id":"1","score":0.95,"issues":[]}]}\n```', ['1', '2'])
    expect(parsed.get('1')?.score).toBe(0.95)
    expect(parsed.get('2')?.score).toBe(0.42)
    expect(parsed.get('2')?.issues).toEqual(['mistranslation', 'other'])
  })

  it('clamps scores and ignores unknown ids', () => {
    const parsed = parseQualityResponse('{"items":[{"id":"1","score":1.8,"issues":[]},{"id":"9","score":0.1},{"id":"2","score":-1}]}', ['1', '2'])
    expect(parsed.get('1')?.score).toBe(1)
    expect(parsed.get('2')?.score).toBe(0)
    expect(parsed.has('9')).toBe(false)
  })

  it('returns empty map for malformed output', () => {
    expect(parseQualityResponse('not json', ['1']).size).toBe(0)
    expect(parseQualityResponse('{"items":[]}', ['1']).size).toBe(0)
  })
})
