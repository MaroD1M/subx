import { describe, expect, it } from 'vitest'
import { normalizeTaskRetryPolicy, retryDelaySeconds, shouldRetryTaskError } from '../taskRetry'

describe('task retry policy', () => {
  it('defaults to retrying transient errors only', () => {
    const policy = normalizeTaskRetryPolicy({})
    expect(policy.maxAttempts).toBe(3)
    expect(shouldRetryTaskError(policy, 'network')).toBe(true)
    expect(shouldRetryTaskError(policy, 'timeout')).toBe(true)
    expect(shouldRetryTaskError(policy, 'rate_limit')).toBe(true)
    expect(shouldRetryTaskError(policy, 'auth')).toBe(false)
    expect(shouldRetryTaskError(policy, 'content')).toBe(false)
  })

  it('clamps retry inputs and calculates capped exponential delays', () => {
    const policy = normalizeTaskRetryPolicy({
      maxAttempts: 99,
      backoff: 'exponential',
      baseSeconds: 10,
      maxSeconds: 45,
      retryOn: ['network', 'not-a-type']
    })
    expect(policy.maxAttempts).toBe(10)
    expect(policy.baseSeconds).toBe(10)
    expect(policy.retryOn).toEqual(['network'])
    expect(retryDelaySeconds(policy, 1)).toBe(10)
    expect(retryDelaySeconds(policy, 2)).toBe(20)
    expect(retryDelaySeconds(policy, 3)).toBe(40)
    expect(retryDelaySeconds(policy, 4)).toBe(45)
  })
})
