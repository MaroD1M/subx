import { describe, expect, it } from 'vitest'
import {
  computeActiveElapsedMs,
  computeStageElapsedMs,
  computeTaskEtaMs,
  formatDuration,
  smoothEtaMs
} from '../../../shared/taskTiming'

const base = Date.parse('2026-01-01T00:00:00Z')
const at = (seconds: number) => new Date(base + seconds * 1000).toISOString()

describe('task timing', () => {
  it('computes active elapsed time and excludes paused time', () => {
    expect(computeActiveElapsedMs({
      status: 'translating',
      createdAt: at(-60),
      startedAt: at(0),
      pausedTotalMs: 120_000
    }, base + 600_000)).toBe(480_000)

    expect(computeActiveElapsedMs({
      status: 'paused',
      startedAt: at(0),
      pausedAt: at(300),
      pausedTotalMs: 60_000
    }, base + 600_000)).toBe(240_000)

    expect(computeActiveElapsedMs({
      status: 'done',
      startedAt: at(0),
      finishedAt: at(600),
      pausedTotalMs: 120_000
    }, base + 1_200_000)).toBe(480_000)
  })

  it('computes stage elapsed and stage ETA', () => {
    const stageElapsed = computeStageElapsedMs({
      status: 'translating',
      stepStartedAt: at(300)
    }, base + 600_000)
    expect(stageElapsed).toBe(300_000)

    const eta = computeTaskEtaMs({
      status: 'translating',
      progress: 60,
      stepProgress: 50,
      startedAt: at(0),
      stepStartedAt: at(300)
    }, [], base + 600_000)
    expect(eta.stageMs).toBe(300_000)
    expect(eta.overallMs).toBe(400_000)
  })

  it('prefers recent progress samples for overall ETA', () => {
    const eta = computeTaskEtaMs({
      status: 'translating',
      progress: 30,
      stepProgress: 20,
      startedAt: at(0),
      stepStartedAt: at(0)
    }, [
      { at: base, progress: 10 },
      { at: base + 60_000, progress: 20 }
    ], base + 120_000)
    expect(eta.overallMs).toBe(420_000)
  })

  it('does not estimate ETA for paused or terminal tasks', () => {
    expect(computeTaskEtaMs({ status: 'paused', progress: 50, stepProgress: 50 }).overallMs).toBeNull()
    expect(computeTaskEtaMs({ status: 'done', progress: 100 }).overallMs).toBeNull()
  })

  it('smooths ETA changes and formats durations', () => {
    expect(smoothEtaMs(100_000, 200_000, 0.3)).toBe(130_000)
    expect(smoothEtaMs(null, 50_000)).toBe(50_000)
    expect(formatDuration(45_000)).toBe('45 秒')
    expect(formatDuration(90 * 60_000)).toBe('1 小时 30 分钟')
    expect(formatDuration(26 * 60 * 60_000)).toBe('1 天 2 小时')
    expect(formatDuration(null)).toBe('-')
  })
})
