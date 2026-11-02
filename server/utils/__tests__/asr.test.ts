import { describe, expect, it, vi } from 'vitest'
import { join } from 'path'
import { AsrService } from '../asr/client'
import type { AsrResult } from '../asr/types'

describe('AsrService', () => {
  it('converts ASR segments to subtitle entries with timestamps and confidence', () => {
    const result: AsrResult = {
      language: 'en',
      duration: 10,
      text: 'Hello world. Goodbye.',
      segments: [
        { id: 1, start: 1.2, end: 3.4, text: ' Hello world. ', confidence: 0.9 },
        { id: 2, start: 4, end: 6, text: 'Goodbye.', confidence: 0.8 },
        { id: 3, start: 7, end: 8, text: '   ', confidence: 0.1 }
      ]
    }

    const entries = AsrService.toSubtitleEntries(result)
    expect(entries).toHaveLength(2)
    expect(entries[0]?.startTime).toBe('00:00:01,200')
    expect(entries[0]?.endTime).toBe('00:00:03,400')
    expect(entries[0]?.text).toBe('Hello world.')
    expect(entries[0]?.asrConfidence).toBe(0.9)
    expect(entries[1]?.startTime).toBe('00:00:04,000')
  })

  it('ensures end time is after start time', () => {
    const entries = AsrService.toSubtitleEntries({
      language: 'en',
      duration: 2,
      text: 'Hi',
      segments: [{ id: 1, start: 1, end: 1, text: 'Hi', confidence: 0.5 }]
    })
    expect(entries[0]?.endTime).toBe('00:00:01,300')
  })

  it('filters common hallucination lines', () => {
    const entries = AsrService.toSubtitleEntries({
      language: 'en',
      duration: 3,
      text: 'Thank you for watching.',
      segments: [
        { id: 1, start: 0, end: 1, text: 'Thank you for watching.', confidence: 0.9 },
        { id: 2, start: 1, end: 2, text: 'Real dialogue.', confidence: 0.9 }
      ]
    })
    expect(entries.map(entry => entry.text)).toEqual(['Real dialogue.'])
  })

  it('passes device and compute type to the ASR service', async () => {
    const originalFetch = globalThis.fetch
    let capturedDevice = ''
    let capturedComputeType = ''
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => {
      const body = init?.body as FormData
      capturedDevice = String(body.get('device') || '')
      capturedComputeType = String(body.get('compute_type') || '')
      return new Response(JSON.stringify({
        language: 'en',
        duration: 1,
        text: 'Hi',
        segments: [{ id: 1, start: 0, end: 1, text: 'Hi' }]
      }), { status: 200, headers: { 'content-type': 'application/json' } })
    }))

    try {
      await AsrService.transcribe(join(process.cwd(), 'package.json'), {
        baseUrl: 'http://asr.test',
        device: 'cpu',
        computeType: 'float16'
      })
      expect(capturedDevice).toBe('cpu')
      expect(capturedComputeType).toBe('float16')
    } finally {
      vi.stubGlobal('fetch', originalFetch)
    }
  })

  it('polls ASR jobs and reports real progress', async () => {
    const originalFetch = globalThis.fetch
    process.env.ASR_POLL_MS = '1'
    let statusCalls = 0
    const progress: number[] = []
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (String(url).endsWith('/v1/audio/transcriptions/jobs')) {
        return new Response(JSON.stringify({ jobId: 'job-1', status: 'queued' }), { status: 200 })
      }
      statusCalls++
      if (statusCalls === 1) {
        return new Response(JSON.stringify({ status: 'running', progress: 45, message: '正在识别' }), { status: 200 })
      }
      return new Response(JSON.stringify({
        status: 'done',
        progress: 100,
        message: '识别完成',
        result: { language: 'en', duration: 2, text: 'Hi', segments: [{ id: 1, start: 0, end: 2, text: 'Hi' }] }
      }), { status: 200 })
    }))

    try {
      const result = await AsrService.transcribe(join(process.cwd(), 'package.json'), {
        baseUrl: 'http://asr.test',
        onProgress: value => progress.push(value)
      })
      expect(result.text).toBe('Hi')
      expect(progress).toContain(45)
      expect(progress).toContain(100)
    } finally {
      delete process.env.ASR_POLL_MS
      vi.stubGlobal('fetch', originalFetch)
    }
  })

  it('reports the ASR service URL and network cause when connection fails', async () => {
    const originalFetch = globalThis.fetch
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw Object.assign(new Error('fetch failed'), { cause: { code: 'ECONNREFUSED' } })
    }))
    try {
      const error = await AsrService.transcribe(join(process.cwd(), 'package.json'), {
        baseUrl: 'http://127.0.0.1:9999'
      }).catch(e => e)
      expect(String(error?.message)).toContain('无法连接 ASR 服务')
      expect(String(error?.message)).toContain('ECONNREFUSED')
    } finally {
      vi.stubGlobal('fetch', originalFetch)
    }
  })

  it('splits long segments by word timestamps', () => {
    const entries = AsrService.toSubtitleEntries({
      language: 'en',
      duration: 10,
      text: 'one two three four five six seven eight nine ten',
      segments: [{
        id: 1,
        start: 0,
        end: 10,
        text: 'one two three four five six seven eight nine ten',
        confidence: 0.9,
        words: ['one','two','three','four','five','six','seven','eight','nine','ten'].map((word, index) => ({
          start: index,
          end: index + 0.8,
          word: ` ${word}`
        }))
      }]
    })
    expect(entries.length).toBeGreaterThan(1)
    expect(entries.every(entry => entry.text.length <= 42)).toBe(true)
  })

})
