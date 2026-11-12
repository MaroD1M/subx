import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MAX_SINGLE_TIMER_DELAY_MS, scheduleLongTimeout } from '../longTimeout'

describe('long timeout scheduling', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('schedules delays above the single-timer limit in chunks', () => {
    const callback = vi.fn()
    const delay = MAX_SINGLE_TIMER_DELAY_MS + 5_000
    scheduleLongTimeout(delay, callback)

    vi.advanceTimersByTime(MAX_SINGLE_TIMER_DELAY_MS)
    expect(callback).not.toHaveBeenCalled()

    vi.advanceTimersByTime(5_000)
    expect(callback).toHaveBeenCalledTimes(1)
  })

  it('can be cancelled before the deadline', () => {
    const callback = vi.fn()
    const cancel = scheduleLongTimeout(MAX_SINGLE_TIMER_DELAY_MS + 5_000, callback)
    cancel()
    vi.advanceTimersByTime(MAX_SINGLE_TIMER_DELAY_MS + 10_000)
    expect(callback).not.toHaveBeenCalled()
  })

  it('falls back to an immediate schedule for non-finite delays', () => {
    const callback = vi.fn()
    scheduleLongTimeout(Number.POSITIVE_INFINITY, callback)
    vi.advanceTimersByTime(0)
    expect(callback).toHaveBeenCalledTimes(1)
  })
})
