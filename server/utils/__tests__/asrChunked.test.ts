import { describe, expect, it } from 'vitest'
import { join } from 'path'
import { buildAsrCheckpointKey, buildAsrChunkPlan, mergeChunkResults } from '../asr/chunked'

describe('ASR chunking', () => {
  it('builds overlapping chunks and keeps the final tail', () => {
    const plan = buildAsrChunkPlan(1000, 300, 2)
    expect(plan).toHaveLength(4)
    expect(plan[0]).toMatchObject({ startMs: 0, endMs: 300_000 })
    expect(plan[1]).toMatchObject({ startMs: 300_000, endMs: 602_000 })
    expect(plan[2]).toMatchObject({ startMs: 600_000, endMs: 902_000 })
    expect(plan[3]).toMatchObject({ startMs: 900_000, endMs: 1_000_000 })
  })

  it('ignores empty segments returned by silent chunks', () => {
    const merged = mergeChunkResults([
      {
        plan: { index: 0, startMs: 0, endMs: 300_000 },
        reused: false,
        result: {
          task: 'transcribe', engine: 'test', language: 'en', duration: 300, text: '',
          segments: [{ id: 1, start: 0, end: 0.1, text: '   ' }]
        }
      },
      {
        plan: { index: 1, startMs: 300_000, endMs: 600_000 },
        reused: false,
        result: {
          task: 'transcribe', engine: 'test', language: 'en', duration: 300, text: '',
          segments: [{ id: 1, start: 1, end: 2, text: 'Real speech' }]
        }
      }
    ])

    expect(merged.segments.map(segment => segment.text)).toEqual(['Real speech'])
  })

  it('does not duplicate overlapping segments during merge', () => {
    const merged = mergeChunkResults([
      {
        plan: { index: 0, startMs: 0, endMs: 302_000 },
        reused: false,
        result: {
          task: 'transcribe', engine: 'test', language: 'en', duration: 302, text: '',
          segments: [
            { id: 1, start: 1, end: 2, text: 'Hello' },
            { id: 2, start: 299, end: 301, text: 'World' }
          ]
        }
      },
      {
        plan: { index: 1, startMs: 300_000, endMs: 602_000 },
        reused: false,
        result: {
          task: 'transcribe', engine: 'test', language: 'en', duration: 302, text: '',
          segments: [
            { id: 1, start: 0, end: 1, text: 'World' },
            { id: 2, start: 2, end: 3, text: 'Again' }
          ]
        }
      }
    ])

    expect(merged.segments.map(segment => segment.text)).toEqual(['Hello', 'World', 'Again'])
    expect(merged.segments.map(segment => segment.id)).toEqual([1, 2, 3])
    expect(merged.segments[1]!.start).toBeCloseTo(299, 3)
    expect(merged.segments[2]!.start).toBeCloseTo(302, 3)
  })

  it('throws instead of silently truncating extremely long audio', () => {
    expect(() => buildAsrChunkPlan(501 * 300, 300, 0)).toThrow(/分段数量超过上限/)
  })

  it('invalidates checkpoints when ASR settings change', async () => {
    const task = { filePath: 'sample.mkv', rootId: 'default', trackIndex: 0 } as any
    const audioPath = join(process.cwd(), 'package.json')
    const base = {
      baseUrl: 'http://asr.test',
      model: 'small',
      language: 'auto',
      engine: 'auto' as const,
      preprocess: 'off' as const
    }
    const baseline = await buildAsrCheckpointKey(task, { ...base, vad: true, wordTimestamps: true }, audioPath)
    expect(await buildAsrCheckpointKey(task, { ...base, vad: false, wordTimestamps: true }, audioPath)).not.toBe(baseline)
    expect(await buildAsrCheckpointKey(task, { ...base, vad: true, wordTimestamps: false }, audioPath)).not.toBe(baseline)
    expect(await buildAsrCheckpointKey(task, { ...base, vad: true, wordTimestamps: true, diarize: true }, audioPath)).not.toBe(baseline)
  })

  it('invalidates checkpoints when cloud settings change', async () => {
    const task = { filePath: 'sample.mkv', rootId: 'default', trackIndex: 0 } as any
    const audioPath = join(process.cwd(), 'package.json')
    const base = {
      baseUrl: 'http://asr.test',
      model: 'small',
      language: 'auto',
      engine: 'auto' as const,
      preprocess: 'off' as const,
      cloudEnabled: true,
      cloudBaseUrl: 'https://api.openai.com/v1',
      cloudModel: 'whisper-1',
      cloudFallback: true
    }
    const baseline = await buildAsrCheckpointKey(task, base, audioPath)
    expect(await buildAsrCheckpointKey(task, { ...base, cloudModel: 'whisper-large-v3' }, audioPath)).not.toBe(baseline)
    expect(await buildAsrCheckpointKey(task, { ...base, cloudEnabled: false }, audioPath)).not.toBe(baseline)
  })
})
