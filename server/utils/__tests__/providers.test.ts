import { describe, expect, it } from 'vitest'
import { createProvider, normalizeProviderType } from '../providers/registry'

describe('provider registry', () => {
  it('normalizes unknown provider types to OpenAI-compatible', () => {
    expect(normalizeProviderType('anthropic')).toBe('anthropic')
    expect(normalizeProviderType('gemini')).toBe('gemini')
    expect(normalizeProviderType('unknown')).toBe('openai-compatible')
  })

  it('creates provider adapters with expected capabilities', () => {
    const openai = createProvider({ type: 'openai-compatible', apiKey: 'k', model: 'm' })
    const anthropic = createProvider({ type: 'anthropic', apiKey: 'k', model: 'm' })
    const gemini = createProvider({ type: 'gemini', apiKey: 'k', model: 'm' })

    expect(openai.type).toBe('openai-compatible')
    expect(openai.supportsStreaming).toBe(true)
    expect(anthropic.type).toBe('anthropic')
    expect(anthropic.supportsStreaming).toBe(false)
    expect(gemini.type).toBe('gemini')
    expect(gemini.supportsStreaming).toBe(false)
  })
})
