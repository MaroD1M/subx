import { createError } from 'h3'
import { consumeRateLimit } from '../utils/rateLimit'

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

const RULES: Array<{ pattern: RegExp, limit: number, windowMs: number }> = [
  { pattern: /^\/api\/task$/, limit: 30, windowMs: 60_000 },
  { pattern: /^\/api\/tasks\/[^/]+\/review-retranslate$/, limit: 10, windowMs: 60_000 },
  { pattern: /^\/api\/model-list$/, limit: 20, windowMs: 60_000 },
  { pattern: /^\/api\/notification-proxy-test$/, limit: 10, windowMs: 60_000 },
  { pattern: /^\/api\/notification-channels\/[^/]+\/test$/, limit: 10, windowMs: 60_000 },
  { pattern: /^\/api\/integrations\/[^/]+$/, limit: 120, windowMs: 60_000 }
]

export default defineEventHandler((event) => {
  const method = String(event.method || '').toUpperCase()
  if (!MUTATING_METHODS.has(method)) return
  const pathname = getRequestURL(event).pathname
  const rule = RULES.find(item => item.pattern.test(pathname))
  if (!rule) return

  const trustProxy = String(process.env.TRUST_PROXY || '').toLowerCase() === 'true'
  const ip = getRequestIP(event, { xForwardedFor: trustProxy }) || event.node.req.socket.remoteAddress || 'unknown'
  const result = consumeRateLimit(`${method}:${pathname}:${ip}`, rule.limit, rule.windowMs)
  if (result.allowed) return

  setHeader(event, 'Retry-After', Math.max(1, Math.ceil(result.retryAfterMs / 1000)))
  throw createError({ statusCode: 429, message: '请求过于频繁，请稍后再试' })
})
