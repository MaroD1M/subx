import { describe, expect, it } from 'vitest'
import {
  isReviewFinalDiffersFromTranslation,
  isReviewFinalSameAsSource,
  isReviewLatinHeavy,
  isReviewNeedsAttention,
  isReviewOverlong,
  isReviewSameAsSource,
  isReviewTranslationEmpty,
  matchesReviewContentFilter,
  matchesReviewSearch,
  normalizeReviewText
} from '../../shared/reviewFilters'

describe('review filters', () => {
  it('normalizes formatting and punctuation before comparison', () => {
    expect(normalizeReviewText('  Hello, <i>world</i>!  ')).toBe('helloworld')
    expect(normalizeReviewText('{tag}你 好，世界。')).toBe('你好世界')
    expect(isReviewSameAsSource({
      originalText: 'Hello, world!',
      translatedText: '<i>Hello world</i>'
    })).toBe(true)
  })

  it('detects empty and same-as-source translations separately', () => {
    expect(isReviewTranslationEmpty({ translatedText: '   ' })).toBe(true)
    expect(isReviewSameAsSource({ originalText: 'Hello', translatedText: '' })).toBe(false)
    expect(isReviewSameAsSource({ originalText: 'Hello', translatedText: 'Hello' })).toBe(true)
    expect(isReviewSameAsSource({ originalText: 'Hello', translatedText: '你好' })).toBe(false)
  })

  it('compares final export with source and translation', () => {
    expect(isReviewFinalSameAsSource({ originalText: 'Hello', finalText: 'Hello!' })).toBe(true)
    expect(isReviewFinalDiffersFromTranslation({
      translatedText: '你好',
      finalText: '你好，世界'
    })).toBe(true)
    expect(isReviewFinalDiffersFromTranslation({
      translatedText: '你好',
      finalText: '你好！'
    })).toBe(false)
    expect(isReviewFinalDiffersFromTranslation({
      translatedText: '',
      finalText: 'Hello'
    })).toBe(false)
  })

  it('flags latin-heavy and overlong translations', () => {
    expect(isReviewLatinHeavy({ originalText: 'Hello there', translatedText: 'Hello there' })).toBe(true)
    expect(isReviewLatinHeavy({ originalText: '你好', translatedText: 'Hello' })).toBe(false)
    expect(isReviewOverlong({
      originalText: 'Hi',
      translatedText: '这是一段异常偏长而且明显超出原文长度的译文内容，需要用户重点检查。'.repeat(3)
    })).toBe(true)
  })

  it('combines attention signals for the quick preset', () => {
    expect(isReviewNeedsAttention({ originalText: 'Hello', translatedText: 'Hello' })).toBe(true)
    expect(isReviewNeedsAttention({ originalText: 'Hello', translatedText: '你好', qualityScore: 0.4 }, 0.7)).toBe(true)
    expect(isReviewNeedsAttention({ originalText: 'Hello', translatedText: '你好', asrConfidence: 0.4 })).toBe(true)
    expect(isReviewNeedsAttention({ originalText: 'Hello', translatedText: '你好', reviewReasons: ['same_as_source_allowed'] })).toBe(false)
    expect(isReviewNeedsAttention({ originalText: 'Hello', translatedText: '你好' })).toBe(false)
  })

  it('matches content filters and keyword search', () => {
    const entry = {
      subtitleId: '12',
      originalText: 'Jon Snow',
      translatedText: '琼恩·雪诺',
      finalText: '琼恩·雪诺'
    }
    expect(matchesReviewContentFilter(entry, 'all')).toBe(true)
    expect(matchesReviewContentFilter(entry, 'same_as_source')).toBe(false)
    expect(matchesReviewContentFilter(entry, 'final_differs')).toBe(false)
    expect(matchesReviewSearch(entry, 'snow')).toBe(true)
    expect(matchesReviewSearch(entry, '琼恩')).toBe(true)
    expect(matchesReviewSearch(entry, '12')).toBe(true)
    expect(matchesReviewSearch(entry, '#12')).toBe(true)
    expect(matchesReviewSearch(entry, 'nothing')).toBe(false)
  })
})
