import { describe, expect, it } from 'vitest'
import { TranslationMemoryService } from '../translationMemory'

describe('translation memory', () => {
  it('normalizes whitespace and formatting for lookup hashes', () => {
    expect(TranslationMemoryService.hash('zh-CN', 'Hello   world')).toBe(TranslationMemoryService.hash('zh-CN', 'Hello world'))
    expect(TranslationMemoryService.hash('zh-CN', 'Hello')).not.toBe(TranslationMemoryService.hash('zh-TW', 'Hello'))
  })
})
