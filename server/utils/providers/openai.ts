import OpenAI from 'openai'
import { EMPTY_USAGE, type BoundTranslationProvider, type ProviderRequest, type ProviderRuntimeConfig, type ProviderUsage } from './types'

const REQUEST_TIMEOUT_MS = 5 * 60 * 1000
const IDLE_TIMEOUT_MS = 45 * 1000

function usageFrom(raw: any): ProviderUsage {
  return {
    promptTokens: Number(raw?.prompt_tokens || 0),
    completionTokens: Number(raw?.completion_tokens || 0),
    totalTokens: Number(raw?.total_tokens || 0)
  }
}

function combineSignal(signal: AbortSignal | undefined, idle: AbortController): AbortSignal {
  if (!signal) return idle.signal
  if (typeof AbortSignal.any === 'function') return AbortSignal.any([signal, idle.signal])
  return signal
}

export function createOpenAIProvider(config: ProviderRuntimeConfig): BoundTranslationProvider {
  const client = new OpenAI({
    apiKey: config.apiKey,
    baseURL: config.baseUrl || 'https://api.openai.com/v1'
  })

  return {
    type: 'openai-compatible',
    supportsStreaming: true,

    async listModels() {
      const list = await client.models.list()
      const models: Array<{ id: string, owned_by?: string }> = []
      for await (const model of list) {
        models.push({ id: model.id, owned_by: model.owned_by || '' })
      }
      return models.sort((a, b) => a.id.localeCompare(b.id))
    },

    async complete(request: ProviderRequest) {
      const response = await client.chat.completions.create({
        model: request.model || config.model,
        messages: [
          { role: 'system', content: request.system },
          { role: 'user', content: request.prompt }
        ],
        temperature: request.temperature ?? config.temperature,
        max_tokens: request.maxOutputTokens ?? config.maxOutputTokens,
        stream: false
      } as any, { signal: request.signal, timeout: REQUEST_TIMEOUT_MS }) as any

      return {
        content: String(response.choices?.[0]?.message?.content || ''),
        usage: response.usage ? usageFrom(response.usage) : { ...EMPTY_USAGE }
      }
    },

    async *stream(request: ProviderRequest) {
      const idle = new AbortController()
      const signal = combineSignal(request.signal, idle)
      const response = await client.chat.completions.create({
        model: request.model || config.model,
        messages: [
          { role: 'system', content: request.system },
          { role: 'user', content: request.prompt }
        ],
        temperature: request.temperature ?? config.temperature,
        max_tokens: request.maxOutputTokens ?? config.maxOutputTokens,
        stream: true,
        stream_options: { include_usage: true }
      } as any, { signal, timeout: REQUEST_TIMEOUT_MS }) as any

      let lastChunkAt = Date.now()
      for await (const part of response) {
        if (Date.now() - lastChunkAt > IDLE_TIMEOUT_MS) {
          try { idle.abort() } catch { /* ignore */ }
          throw new Error(`流式响应长时间无数据（>${Math.round(IDLE_TIMEOUT_MS / 1000)}s），已中止本次请求`)
        }
        if (part.usage || part.choices?.[0]?.delta?.content) lastChunkAt = Date.now()
        yield {
          content: String(part.choices?.[0]?.delta?.content || ''),
          usage: part.usage ? usageFrom(part.usage) : undefined
        }
      }
    }
  }
}
