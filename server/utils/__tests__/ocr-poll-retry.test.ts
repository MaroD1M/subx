import { afterEach, describe, expect, it, vi } from 'vitest'
import { OcrService } from '../ocr/client'

const undiciFetchMock = vi.hoisted(() => vi.fn())

vi.mock('undici', async (importOriginal) => {
  const actual = await importOriginal<typeof import('undici')>()
  return { ...actual, fetch: undiciFetchMock }
})

afterEach(() => {
  delete process.env.OCR_POLL_MS
  undiciFetchMock.mockReset()
})

describe('OCR job polling retries', () => {
  it('retries a transient status poll network failure without cancelling the job', async () => {
    process.env.OCR_POLL_MS = '1'
    let pollCalls = 0
    let cancelCalls = 0
    undiciFetchMock.mockImplementation(async (url: string) => {
      const target = String(url)
      if (target.endsWith('/v1/subtitles/ocr/jobs')) {
        return new Response(JSON.stringify({ ok: true, jobId: 'job-retry', status: 'queued' }), { status: 200 })
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
        result: { engine: 'ocr:ffmpeg-tesseract', language: 'en', duration: 1, text: 'Recovered', segments: [{ start: 0, end: 1, text: 'Recovered' }] }
      }), { status: 200 })
    })

    const result = await OcrService.transcribe('/media/Movie.mkv', {
      baseUrl: 'http://subx-ocr:8000',
      language: 'en',
      trackIndex: 0
    })

    expect(result.text).toBe('Recovered')
    expect(pollCalls).toBe(2)
    expect(cancelCalls).toBe(0)
  })
})
