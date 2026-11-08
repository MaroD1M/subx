import { beforeEach, describe, expect, it } from 'vitest'
import { consumeRateLimit, resetRateLimits } from '../rateLimit'

beforeEach(() => resetRateLimits())

describe('consumeRateLimit', () => {
  it('allows requests up to the limit and then blocks', () => {
    const now = 1000
    expect(consumeRateLimit('k', 2, 60_000, now).allowed).toBe(true)
    expect(consumeRateLimit('k', 2, 60_000, now).allowed).toBe(true)
    const blocked = consumeRateLimit('k', 2, 60_000, now)
    expect(blocked.allowed).toBe(false)
    expect(blocked.retryAfterMs).toBe(60_000)
  })

  it('resets after the window', () => {
    const now = 1000
    consumeRateLimit('k2', 1, 5000, now)
    expect(consumeRateLimit('k2', 1, 5000, now + 5001).allowed).toBe(true)
  })

  it('isolates different keys', () => {
    consumeRateLimit('a', 1, 1000, 0)
    expect(consumeRateLimit('b', 1, 1000, 0).allowed).toBe(true)
  })
})
