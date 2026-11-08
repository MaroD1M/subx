import { describe, expect, it } from 'vitest'
import {
  isReviewFinalDiffersFromTranslation,
  isReviewLatinHeavy,
  isReviewNeedsAttention,
  isReviewOverlong,
  isReviewSameAsSource,
  matchesReviewContentFilter,
  matchesReviewSearch,
  normalizeReviewText
} from '~~/shared/reviewFilters'

describe('review filters', () => {
  it('normalizes formatting and punctuation', () => {
    expect(normalizeReviewText('  <i>Hello</i>, {\\an8}世界！ ')).toBe('hello世界')
  })

  it('detects same-as-source and final differences', () => {
    expect(isReviewSameAsSource({ originalText: 'Hello!', translatedText: 'hello' })).toBe(true)
    expect(isReviewFinalDiffersFromTranslation({ translatedText: '你好', finalText: '您好' })).toBe(true)
    expect(isReviewFinalDiffersFromTranslation({ translatedText: '你好', finalText: '你好' })).toBe(false)
  })

  it('flags latin-heavy and overlong translations', () => {
    expect(isReviewLatinHeavy({ originalText: 'Hello world', translatedText: 'Hello there' })).toBe(true)
    expect(isReviewOverlong({ originalText: 'Hi', translatedText: '这是一个明显过长且不应该出现的译文'.repeat(4) })).toBe(true)
  })

  it('combines attention filters', () => {
    expect(isReviewNeedsAttention({ translatedText: '' })).toBe(true)
    expect(isReviewNeedsAttention({ translatedText: '你好', reviewStatus: 'translated' })).toBe(false)
    expect(matchesReviewContentFilter({ translatedText: '' }, 'empty')).toBe(true)
    expect(matchesReviewContentFilter({ translatedText: '你好' }, 'empty')).toBe(false)
  })

  it('searches text and subtitle id', () => {
    const entry = { subtitleId: 42, originalText: 'Hello', translatedText: '你好', finalText: '您好' }
    expect(matchesReviewSearch(entry, '#42')).toBe(true)
    expect(matchesReviewSearch(entry, '你好')).toBe(true)
    expect(matchesReviewSearch(entry, 'missing')).toBe(false)
  })
})
