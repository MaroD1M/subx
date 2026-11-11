import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { AsrService } from '../asr/client'
import { OcrService } from '../ocr/client'

const undiciFetchMock = vi.hoisted(() => vi.fn())

vi.mock('undici', async (importOriginal) => {
  const actual = await importOriginal<typeof import('undici')>()
  return { ...actual, fetch: undiciFetchMock }
})

const dirs: string[] = []
function sampleFile() {
  const dir = mkdtempSync(join(tmpdir(), 'subx-v16-'))
  dirs.push(dir)
  const file = join(dir, 'sample.wav')
  writeFileSync(file, 'RIFFdemo')
  return file
}

afterEach(() => {
  undiciFetchMock.mockReset()
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe('cloud ASR and OCR clients', () => {
  it('maps OpenAI-compatible verbose_json to SubX segments', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      language: 'en',
      duration: 3,
      text: 'Hello cloud world.',
      segments: [{ start: 0, end: 3, text: 'Hello cloud world.', avg_logprob: -0.2 }],
      words: [
        { word: 'Hello', start: 0, end: 1, probability: 0.9 },
        { word: 'cloud', start: 1, end: 2, probability: 0.8 },
        { word: 'world.', start: 2, end: 3, probability: 0.7 }
      ]
    }), { status: 200, headers: { 'content-type': 'application/json' } }))
    undiciFetchMock.mockImplementation(fetchMock)
    const result = await AsrService.transcribe(sampleFile(), {
      baseUrl: 'http://unused',
      engine: 'cloud',
      cloudEnabled: true,
      cloudBaseUrl: 'https://cloud.example/v1',
      cloudApiKey: 'secret',
      cloudModel: 'whisper-1'
    })
    expect(result.engine).toBe('cloud')
    expect(result.language).toBe('en')
    expect(result.segments[0]?.text).toBe('Hello cloud world.')
    expect(result.segments[0]?.words).toHaveLength(3)
    expect(result.segments[0]?.confidence).toBeGreaterThan(0.7)
    const [url, init] = fetchMock.mock.calls[0] as any
    expect(url).toBe('https://cloud.example/v1/audio/transcriptions')
    expect(init.headers.Authorization).toBe('Bearer secret')
  })

  it('falls back to cloud when local ASR fails and fallback is enabled', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).includes('cloud.example')) {
        return new Response(JSON.stringify({ language: 'ja', duration: 2, segments: [{ start: 0, end: 2, text: 'こんにちは' }] }), { status: 200 })
      }
      return new Response('local unavailable', { status: 500 })
    })
    undiciFetchMock.mockImplementation(fetchMock)
    const result = await AsrService.transcribe(sampleFile(), {
      baseUrl: 'http://local-asr:8000',
      engine: 'faster-whisper',
      cloudEnabled: true,
      cloudFallback: true,
      cloudBaseUrl: 'https://cloud.example/v1',
      cloudApiKey: 'secret',
      cloudModel: 'whisper-1'
    })
    expect(result.engine).toBe('cloud')
    expect(result.preprocessWarning).toContain('云兜底')
  })

  it('sends OCR requests with absolute media path and track index', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).endsWith('/v1/subtitles/ocr/jobs')) return new Response('', { status: 404 })
      return new Response(JSON.stringify({
        engine: 'ocr:pgsrip',
        language: 'zh-CN',
        duration: 5,
        text: 'OCR 字幕',
        segments: [{ start: 0, end: 5, text: 'OCR 字幕' }]
      }), { status: 200 })
    })
    undiciFetchMock.mockImplementation(fetchMock)
    const result = await OcrService.transcribe('/media/Movie.mkv', {
      baseUrl: 'http://subx-ocr:8000',
      language: 'zh-CN',
      trackIndex: 3,
      engine: 'rapidocr',
      minConfidence: 18,
      maxSeconds: 14400,
      chunkSeconds: 1800,
      pgsripTimeoutSeconds: 7200,
      ffmpegTimeoutSeconds: 3600,
      chunkRetries: 1,
      resumeTtlHours: 24
    })
    expect(result.engine).toBe('ocr:pgsrip')
    expect(result.segments[0]?.text).toBe('OCR 字幕')
    const syncCall = fetchMock.mock.calls.find(([url]) => String(url).endsWith('/v1/subtitles/ocr')) as any
    const [url, init] = syncCall
    expect(url).toBe('http://subx-ocr:8000/v1/subtitles/ocr')
    const body = JSON.parse(init.body)
    expect(body.path).toBe('/media/Movie.mkv')
    expect(body.track_index).toBe(3)
    expect(body.language).toBe('zh-CN')
    expect(body.engine).toBe('rapidocr')
    expect(body.min_confidence).toBe(18)
    expect(body.max_seconds).toBe(14400)
    expect(body.chunk_seconds).toBe(1800)
    expect(body.pgsrip_timeout_seconds).toBe(7200)
    expect(body.ffmpeg_timeout_seconds).toBe(3600)
    expect(body.chunk_retries).toBe(1)
    expect(body.resume_ttl_hours).toBe(24)
  })

  it('polls OCR jobs and reports progress', async () => {
    process.env.OCR_POLL_MS = '1'
    let statusCalls = 0
    const progress: number[] = []
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).endsWith('/v1/subtitles/ocr/jobs')) {
        return new Response(JSON.stringify({ ok: true, jobId: 'job-1', status: 'queued' }), { status: 200 })
      }
      statusCalls++
      if (statusCalls === 1) {
        return new Response(JSON.stringify({ status: 'running', progress: 45, message: '识别中' }), { status: 200 })
      }
      return new Response(JSON.stringify({
        status: 'done',
        progress: 100,
        result: { engine: 'ocr:ffmpeg-tesseract', language: 'zh-CN', duration: 4, text: 'OCR JOB', segments: [{ start: 0, end: 4, text: 'OCR JOB' }] }
      }), { status: 200 })
    })
    undiciFetchMock.mockImplementation(fetchMock)
    const result = await OcrService.transcribe('/media/Movie.mkv', {
      baseUrl: 'http://subx-ocr:8000',
      language: 'zh-CN',
      trackIndex: 0,
      onProgress: value => progress.push(value)
    })
    delete process.env.OCR_POLL_MS
    expect(result.text).toBe('OCR JOB')
    expect(progress).toContain(45)
    expect(progress).toContain(100)
  })

  it('omits zero-confidence values from generated subtitle entries', () => {
    const entries = AsrService.toSubtitleEntries({
      language: 'en',
      duration: 3,
      text: 'Hello.',
      segments: [{ id: 1, start: 0, end: 3, text: 'Hello.', confidence: 0 }]
    })
    expect(entries[0]?.asrConfidence).toBeUndefined()
  })
})
