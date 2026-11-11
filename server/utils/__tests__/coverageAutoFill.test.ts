import { describe, expect, it } from 'vitest'
import { computeCoverageNextRun, coverageDefaultPolicy, isCoveragePolicyDue, sanitizeCoveragePolicy } from '../coverageAutoFill'

describe('coverage auto-fill policy', () => {
  it('clamps unsafe numeric values', () => {
    const policy = sanitizeCoveragePolicy({
      enabled: true,
      targetLanguage: 'zh-CN',
      maxTasksPerRun: 9999,
      intervalHours: 0,
      skipRecentDays: -5
    }, 'root-1')
    expect(policy.maxTasksPerRun).toBe(100)
    expect(policy.intervalHours).toBe(1)
    expect(policy.skipRecentDays).toBe(0)
  })

  it('computes the next daily run', () => {
    const policy = coverageDefaultPolicy('root-1')
    policy.enabled = true
    policy.dailyTime = '03:00'
    const next = computeCoverageNextRun(policy, new Date('2026-11-11T04:00:00'))
    expect(next?.getDate()).toBe(12)
    expect(next?.getHours()).toBe(3)
  })

  it('uses the interval from the last run', () => {
    const policy = coverageDefaultPolicy('root-1')
    policy.enabled = true
    policy.scheduleType = 'interval'
    policy.intervalHours = 6
    policy.lastRunAt = '2026-11-11T00:00:00.000Z'
    const next = computeCoverageNextRun(policy, new Date('2026-11-11T05:00:00.000Z'))
    expect(next?.toISOString()).toBe('2026-11-11T06:00:00.000Z')
  })

  it('does not run outside the configured window', () => {
    const policy = coverageDefaultPolicy('root-1')
    policy.enabled = true
    policy.scheduleType = 'interval'
    policy.intervalHours = 1
    policy.lastRunAt = '2026-11-11T00:00:00.000Z'
    policy.runWindowStart = '01:00'
    policy.runWindowEnd = '05:00'
    expect(isCoveragePolicyDue(policy, new Date('2026-11-11T00:30:00'))).toBe(false)
    expect(isCoveragePolicyDue(policy, new Date('2026-11-11T02:00:00'))).toBe(true)
  })
})
