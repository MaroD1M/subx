import { afterEach, describe, expect, it, vi } from 'vitest'
import { OcrService } from '../ocr/client'

const undiciFetchMock = vi.hoisted(() => vi.fn())

vi.mock('undici', async (importOriginal) => {
  const actual = await importOriginal<typeof import('undici')>()
  return { ...actual, fetch: undiciFetchMock }
})

afterEach(() => {
  vi.restoreAllMocks()
  undiciFetchMock.mockReset()
  delete process.env.OCR_POLL_MS
})

describe('OCR queued jobs', () => {
  it('keeps refreshing idle activity while waiting for a concurrency slot', async () => {
    process.env.OCR_POLL_MS = '1'
    let now = 1_000_000
    vi.spyOn(Date, 'now').mockImplementation(() => now)
    let statusCalls = 0
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).endsWith('/v1/subtitles/ocr/jobs')) {
        return new Response(JSON.stringify({ jobId: 'job-queued' }), { status: 200 })
      }
      statusCalls++
      if (statusCalls <= 2) {
        now += 70_000
        return new Response(JSON.stringify({ status: 'queued', progress: 0, message: '排队中' }), { status: 200 })
      }
      return new Response(JSON.stringify({
        status: 'done',
        progress: 100,
        result: {
          engine: 'ocr:ffmpeg-tesseract',
          language: 'en',
          duration: 1,
          text: 'done',
          segments: [{ start: 0, end: 1, text: 'done' }]
        }
      }), { status: 200 })
    })
    undiciFetchMock.mockImplementation(fetchMock)

    const result = await OcrService.transcribe('/media/Movie.mkv', {
      baseUrl: 'http://subx-ocr:8000',
      trackIndex: 0,
      idleTimeoutMs: 60_000
    })

    expect(result.text).toBe('done')
    expect(statusCalls).toBe(3)
    expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith('/cancel'))).toBe(false)
  })
})
