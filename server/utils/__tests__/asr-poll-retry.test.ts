import { afterEach, describe, expect, it, vi } from 'vitest'
import { join } from 'path'
import { AsrService } from '../asr/client'

const undiciFetchMock = vi.hoisted(() => vi.fn())

vi.mock('undici', async (importOriginal) => {
  const actual = await importOriginal<typeof import('undici')>()
  return { ...actual, fetch: undiciFetchMock }
})

afterEach(() => {
  delete process.env.ASR_POLL_MS
  undiciFetchMock.mockReset()
})

describe('ASR job polling retries', () => {
  it('retries a transient poll network failure without cancelling the job', async () => {
    process.env.ASR_POLL_MS = '1'
    let pollCalls = 0
    let cancelCalls = 0
    undiciFetchMock.mockImplementation(async (url: string) => {
      const target = String(url)
      if (target.endsWith('/v1/audio/transcriptions/jobs')) {
        return new Response(JSON.stringify({ jobId: 'job-retry', status: 'queued' }), { status: 200 })
      }
      if (target.endsWith('/cancel')) {
        cancelCalls++
        return new Response('', { status: 200 })
      }
      pollCalls++
      if (pollCalls === 1) {
        throw Object.assign(new Error('fetch failed'), { cause: { code: 'ECONNRESET' } })
      }
      return new Response(JSON.stringify({
        status: 'done',
        progress: 100,
        message: '识别完成',
        result: { language: 'en', duration: 1, text: 'Recovered', segments: [{ id: 1, start: 0, end: 1, text: 'Recovered' }] }
      }), { status: 200 })
    })

    const result = await AsrService.transcribe(join(process.cwd(), 'package.json'), {
      baseUrl: 'http://asr.test'
    })

    expect(result.text).toBe('Recovered')
    expect(pollCalls).toBe(2)
    expect(cancelCalls).toBe(0)
  })
})
