import { describe, expect, it } from 'vitest'
import { createProvider } from '../providers/registry'

const apiKey = String(process.env.OPENCODE_SMOKE_KEY || '').trim()
const live = apiKey ? describe : describe.skip

live('OpenCode Go live smoke test', () => {
  it('lists models and completes with DeepSeek V4.1 Flash 1017', async () => {
    const provider = createProvider({
      type: 'opencode-go',
      apiKey,
      model: 'deepseek-v4.1-flash',
      sessionId: 'subx-live-test'
    })

    const models = await provider.listModels()
    expect(models.some(model => model.id === 'deepseek-v4.1-flash')).toBe(true)

    const result = await provider.complete({
      system: 'You are a literal test responder.',
      prompt: 'Reply with exactly: OK',
      maxOutputTokens: 64,
      temperature: 0
    })
    expect(result.content.trim()).toBe('OK')
  }, 60_000)
})
