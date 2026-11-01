export type ProviderType = 'openai-compatible' | 'anthropic' | 'gemini'

export interface ProviderRuntimeConfig {
  type: ProviderType
  apiKey: string
  baseUrl?: string
  model: string
  temperature?: number
  maxOutputTokens?: number
}

export interface ProviderRequest {
  system: string
  prompt: string
  model?: string
  stream?: boolean
  temperature?: number
  maxOutputTokens?: number
  signal?: AbortSignal
}

export interface ProviderUsage {
  promptTokens: number
  completionTokens: number
  totalTokens: number
}

export interface ProviderResult {
  content: string
  usage: ProviderUsage
}

export interface ProviderStreamEvent {
  content?: string
  usage?: ProviderUsage
}

export interface BoundTranslationProvider {
  readonly type: ProviderType
  readonly supportsStreaming: boolean
  listModels(): Promise<Array<{ id: string, owned_by?: string }>>
  complete(request: ProviderRequest): Promise<ProviderResult>
  stream?(request: ProviderRequest): AsyncIterable<ProviderStreamEvent>
}

export const EMPTY_USAGE: ProviderUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 }
