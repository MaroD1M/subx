import { describe, expect, it } from 'vitest'
import { buildAsrChunkPlan, mergeChunkResults } from '../asr/chunked'

describe('ASR chunking', () => {
  it('builds overlapping chunks and keeps the final tail', () => {
    const plan = buildAsrChunkPlan(1000, 300, 2)
    expect(plan).toHaveLength(4)
    expect(plan[0]).toMatchObject({ startMs: 0, endMs: 300_000 })
    expect(plan[1]).toMatchObject({ startMs: 300_000, endMs: 602_000 })
    expect(plan[2]).toMatchObject({ startMs: 600_000, endMs: 902_000 })
    expect(plan[3]).toMatchObject({ startMs: 900_000, endMs: 1_000_000 })
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
})
