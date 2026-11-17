import { afterEach, describe, expect, it, vi } from 'vitest'
import { createProvider, normalizeProviderType } from '../providers/registry'

describe('provider registry', () => {
  it('normalizes unknown provider types to OpenAI-compatible', () => {
    expect(normalizeProviderType('anthropic')).toBe('anthropic')
    expect(normalizeProviderType('gemini')).toBe('gemini')
    expect(normalizeProviderType('opencode-go')).toBe('opencode-go')
    expect(normalizeProviderType('unknown')).toBe('openai-compatible')
  })

  it('creates provider adapters with expected capabilities', () => {
    const openai = createProvider({ type: 'openai-compatible', apiKey: 'k', model: 'm' })
    const anthropic = createProvider({ type: 'anthropic', apiKey: 'k', model: 'm' })
    const gemini = createProvider({ type: 'gemini', apiKey: 'k', model: 'm' })
    const opencodeGo = createProvider({ type: 'opencode-go', apiKey: 'k', model: 'm' })

    expect(openai.type).toBe('openai-compatible')
    expect(openai.supportsStreaming).toBe(true)
    expect(anthropic.type).toBe('anthropic')
    expect(anthropic.supportsStreaming).toBe(false)
    expect(gemini.type).toBe('gemini')
    expect(gemini.supportsStreaming).toBe(false)
    expect(opencodeGo.type).toBe('opencode-go')
    expect(opencodeGo.supportsStreaming).toBe(true)
  })

  it('sends OpenCode Go session and user-agent headers to the default endpoint', async () => {
    const requests: Array<{ url: string, headers: Headers }> = []
    vi.stubGlobal('fetch', vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      requests.push({ url: String(url), headers: new Headers(init?.headers) })
      return new Response(JSON.stringify({
        id: 'chatcmpl-test',
        object: 'chat.completion',
        choices: [{ index: 0, message: { role: 'assistant', content: 'OK' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 }
      }), { status: 200, headers: { 'content-type': 'application/json' } })
    }))

    const provider = createProvider({
      type: 'opencode-go',
      apiKey: 'test-key',
      model: 'deepseek-v4.1-flash',
      sessionId: 'subx-test-session'
    })
    const result = await provider.complete({ system: 'system', prompt: 'prompt' })

    expect(result.content).toBe('OK')
    expect(requests[0]?.url).toBe('https://opencode.ai/inference/go/openai/v1/chat/completions')
    expect(requests[0]?.headers.get('x-opencode-session')).toBe('subx-test-session')
    expect(requests[0]?.headers.get('user-agent')).toMatch(/^SubX/)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })
})
