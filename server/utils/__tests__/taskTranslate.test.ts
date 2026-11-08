import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SubtitleEntry } from '../../../types'
import { TranslationService } from '../translation'
import { TaskCancelledError } from '../taskState'
import { translateChunkWithRetry } from '../taskTranslate'

vi.mock('../taskLog', () => ({ writeTaskLog: vi.fn() }))

const chunk: SubtitleEntry[] = [
  { id: '1', startTime: '00:00:00,000', endTime: '00:00:01,000', text: 'Hello' },
  { id: '2', startTime: '00:00:01,000', endTime: '00:00:02,000', text: 'World' }
]

const base = {
  targetLanguage: 'zh',
  glossary: {},
  previousContext: [] as SubtitleEntry[],
  model: 'test-model',
  taskId: 'task-1',
  chunkIndex: 0,
  stylePrompt: '',
  maxRetries: 0
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('translateChunkWithRetry', () => {
  it('returns translations in the original chunk order', async () => {
    vi.spyOn(TranslationService, 'translateChunk').mockResolvedValue([
      { ...chunk[1]!, translatedText: '世界' },
      { ...chunk[0]!, translatedText: '你好' }
    ])

    const result = await translateChunkWithRetry({} as any, chunk, base.targetLanguage, base.glossary, base.previousContext, base.model, base.taskId, base.chunkIndex, base.stylePrompt, base.maxRetries)

    expect(result.entries.map(entry => entry.translatedText)).toEqual(['你好', '世界'])
    expect(result.diagnostics.finalStatus).toBe('ok')
  })

  it('falls back to source text when every request fails', async () => {
    vi.spyOn(TranslationService, 'translateChunk').mockRejectedValue(new Error('request failed'))

    const result = await translateChunkWithRetry({} as any, chunk, base.targetLanguage, base.glossary, base.previousContext, base.model, base.taskId, base.chunkIndex, base.stylePrompt, base.maxRetries)

    expect(result.entries.map(entry => entry.translatedText)).toEqual(['Hello', 'World'])
    expect(result.diagnostics.fallbackCount).toBe(2)
    expect(result.diagnostics.finalStatus).toBe('fallback')
  })

  it('propagates cancellation without falling back', async () => {
    vi.spyOn(TranslationService, 'translateChunk').mockRejectedValue(new TaskCancelledError())

    await expect(translateChunkWithRetry({} as any, chunk, base.targetLanguage, base.glossary, base.previousContext, base.model, base.taskId, base.chunkIndex, base.stylePrompt, base.maxRetries))
      .rejects.toBeInstanceOf(TaskCancelledError)
  })
})
