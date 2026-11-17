import type { BoundTranslationProvider, ProviderRuntimeConfig, ProviderType } from './types'
import { createOpenAIProvider } from './openai'
import { createAnthropicProvider } from './anthropic'
import { createGeminiProvider } from './gemini'

export function normalizeProviderType(value: unknown): ProviderType {
  const type = String(value || 'openai-compatible')
  return type === 'anthropic' || type === 'gemini' || type === 'opencode-go' ? type : 'openai-compatible'
}

export function createProvider(config: ProviderRuntimeConfig): BoundTranslationProvider {
  switch (normalizeProviderType(config.type)) {
    case 'anthropic':
      return createAnthropicProvider(config)
    case 'gemini':
      return createGeminiProvider(config)
    case 'opencode-go':
      return createOpenAIProvider(config, 'opencode-go')
    default:
      return createOpenAIProvider(config)
  }
}
