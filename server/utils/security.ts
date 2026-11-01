import type { H3Event } from 'h3'

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

function firstHeaderValue(value: string | undefined): string {
  return String(value || '').split(',')[0]?.trim() || ''
}

export function assertTrustedOrigin(event: H3Event) {
  if (!MUTATING_METHODS.has(String(event.method || '').toUpperCase())) return

  const origin = firstHeaderValue(getHeader(event, 'origin'))
  if (!origin) return

  const allowedOrigins = String(process.env.SUBX_ALLOWED_ORIGINS || '')
    .split(',')
    .map(value => value.trim())
    .filter(Boolean)

  if (allowedOrigins.includes(origin)) return

  const forwardedHost = firstHeaderValue(getHeader(event, 'x-forwarded-host'))
  const host = forwardedHost || firstHeaderValue(getHeader(event, 'host'))
  const forwardedProto = firstHeaderValue(getHeader(event, 'x-forwarded-proto'))
  const proto = forwardedProto || getRequestURL(event).protocol.replace(':', '')

  if (host && origin === `${proto}://${host}`) return

  throw createError({ statusCode: 403, message: '请求来源校验失败' })
}
