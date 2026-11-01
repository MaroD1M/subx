import { EMPTY_USAGE, type BoundTranslationProvider, type ProviderRequest, type ProviderRuntimeConfig, type ProviderUsage } from './types'

const DEFAULT_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta'

function baseUrl(config: ProviderRuntimeConfig) {
  return (config.baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, '')
}

function modelName(model: string) {
  return String(model || '').replace(/^models\//, '')
}

function usageFrom(raw: any): ProviderUsage {
  const prompt = Number(raw?.promptTokenCount || 0)
  const completion = Number(raw?.candidatesTokenCount || 0)
  return {
    promptTokens: prompt,
    completionTokens: completion,
    totalTokens: Number(raw?.totalTokenCount || prompt + completion)
  }
}

async function parseError(response: Response): Promise<never> {
  const text = await response.text().catch(() => '')
  throw new Error(`Gemini 请求失败 (${response.status}): ${text.slice(0, 500)}`)
}

export function createGeminiProvider(config: ProviderRuntimeConfig): BoundTranslationProvider {
  const root = baseUrl(config)

  return {
    type: 'gemini',
    supportsStreaming: false,

    async listModels() {
      const response = await fetch(`${root}/models?key=${encodeURIComponent(config.apiKey)}`)
      if (!response.ok) return []
      const data = await response.json() as any
      return Array.isArray(data?.models)
        ? data.models
            .filter((model: any) => Array.isArray(model.supportedGenerationMethods) && model.supportedGenerationMethods.includes('generateContent'))
            .map((model: any) => ({ id: String(model.name || '').replace(/^models\//, ''), owned_by: 'google' }))
        : []
    },

    async complete(request: ProviderRequest) {
      const model = modelName(request.model || config.model)
      const response = await fetch(`${root}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(config.apiKey)}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: request.system }] },
          contents: [{ role: 'user', parts: [{ text: request.prompt }] }],
          generationConfig: {
            temperature: request.temperature ?? config.temperature,
            maxOutputTokens: request.maxOutputTokens ?? config.maxOutputTokens
          }
        }),
        signal: request.signal
      })
      if (!response.ok) await parseError(response)
      const data = await response.json() as any
      const parts = data?.candidates?.[0]?.content?.parts
      const content = Array.isArray(parts) ? parts.map((part: any) => String(part.text || '')).join('') : ''
      return {
        content,
        usage: data?.usageMetadata ? usageFrom(data.usageMetadata) : { ...EMPTY_USAGE }
      }
    }
  }
}
