import { EMPTY_USAGE, type BoundTranslationProvider, type ProviderRequest, type ProviderRuntimeConfig, type ProviderUsage } from './types'

const DEFAULT_BASE_URL = 'https://api.anthropic.com/v1'
const ANTHROPIC_VERSION = '2023-06-01'

function baseUrl(config: ProviderRuntimeConfig) {
  return (config.baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, '')
}

function usageFrom(raw: any): ProviderUsage {
  return {
    promptTokens: Number(raw?.input_tokens || 0),
    completionTokens: Number(raw?.output_tokens || 0),
    totalTokens: Number(raw?.input_tokens || 0) + Number(raw?.output_tokens || 0)
  }
}

async function parseError(response: Response): Promise<never> {
  const text = await response.text().catch(() => '')
  throw new Error(`Anthropic 请求失败 (${response.status}): ${text.slice(0, 500)}`)
}

export function createAnthropicProvider(config: ProviderRuntimeConfig): BoundTranslationProvider {
  const root = baseUrl(config)

  return {
    type: 'anthropic',
    supportsStreaming: false,

    async listModels() {
      const response = await fetch(`${root}/models`, {
        headers: {
          'x-api-key': config.apiKey,
          'anthropic-version': ANTHROPIC_VERSION
        }
      })
      if (!response.ok) return []
      const data = await response.json() as any
      return Array.isArray(data?.data)
        ? data.data.map((model: any) => ({ id: String(model.id), owned_by: 'anthropic' }))
        : []
    },

    async complete(request: ProviderRequest) {
      const response = await fetch(`${root}/messages`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': config.apiKey,
          'anthropic-version': ANTHROPIC_VERSION
        },
        body: JSON.stringify({
          model: request.model || config.model,
          max_tokens: request.maxOutputTokens ?? config.maxOutputTokens ?? 8192,
          temperature: request.temperature ?? config.temperature,
          system: request.system,
          messages: [{ role: 'user', content: request.prompt }]
        }),
        signal: request.signal
      })
      if (!response.ok) await parseError(response)
      const data = await response.json() as any
      const content = Array.isArray(data?.content)
        ? data.content.filter((part: any) => part?.type === 'text').map((part: any) => String(part.text || '')).join('')
        : ''
      return {
        content,
        usage: data?.usage ? usageFrom(data.usage) : { ...EMPTY_USAGE }
      }
    }
  }
}
