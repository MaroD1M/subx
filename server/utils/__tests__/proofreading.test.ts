import { describe, expect, it } from 'vitest'
import { parseProofreadResponse } from '../proofreading'

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
  })
})
