import { createError } from 'h3'

const MAX_API_BODY_BYTES = 16 * 1024 * 1024
const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

export default defineEventHandler((event) => {
  const pathname = getRequestURL(event).pathname
  if (!pathname.startsWith('/api/')) return
  if (!MUTATING_METHODS.has(String(event.method || '').toUpperCase())) return

  const contentLength = Number(getHeader(event, 'content-length') || 0)
  if (Number.isFinite(contentLength) && contentLength > MAX_API_BODY_BYTES) {
    throw createError({ statusCode: 413, message: '请求体过大' })
  }
})
