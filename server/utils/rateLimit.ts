interface RateLimitBucket {
  count: number
  resetAt: number
}

const buckets = new Map<string, RateLimitBucket>()
const MAX_BUCKETS = 10000

export interface RateLimitResult {
  allowed: boolean
  remaining: number
  retryAfterMs: number
}

export function consumeRateLimit(key: string, limit: number, windowMs: number, now = Date.now()): RateLimitResult {
  const safeLimit = Math.max(1, Math.floor(limit))
  const safeWindow = Math.max(1, Math.floor(windowMs))
  let bucket = buckets.get(key)

  if (!bucket || bucket.resetAt <= now) {
    bucket = { count: 1, resetAt: now + safeWindow }
    buckets.set(key, bucket)
    if (buckets.size > MAX_BUCKETS) {
      for (const [bucketKey, value] of buckets) {
        if (value.resetAt <= now) buckets.delete(bucketKey)
      }
      if (buckets.size > MAX_BUCKETS) buckets.clear()
    }
    return { allowed: true, remaining: safeLimit - 1, retryAfterMs: safeWindow }
  }

  if (bucket.count >= safeLimit) {
    return { allowed: false, remaining: 0, retryAfterMs: Math.max(0, bucket.resetAt - now) }
  }

  bucket.count += 1
  return { allowed: true, remaining: safeLimit - bucket.count, retryAfterMs: Math.max(0, bucket.resetAt - now) }
}

export function resetRateLimits() {
  buckets.clear()
}
