export const DEFAULT_TIME_ZONE = 'Asia/Shanghai'

const SQLITE_UTC_PATTERN = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(?:\.\d+)?$/
const NAIVE_ISO_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?$/
const formatterCache = new Map<string, Intl.DateTimeFormat>()

function getFormatter(locale: string, options: Intl.DateTimeFormatOptions, timeZone: string): Intl.DateTimeFormat {
  const key = `${locale}|${timeZone}|${JSON.stringify(options)}`
  let formatter = formatterCache.get(key)
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(locale, { ...options, timeZone })
    formatterCache.set(key, formatter)
  }
  return formatter
}

export function normalizeTimeZone(value?: unknown, fallback = DEFAULT_TIME_ZONE): string {
  const candidate = String(value || '').trim()
  if (!candidate) return fallback
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: candidate }).format(new Date())
    return candidate
  } catch {
    return fallback
  }
}

export function resolveServerTimeZone(): string {
  if (typeof process === 'undefined' || !process.env) return DEFAULT_TIME_ZONE
  return normalizeTimeZone(process.env.NUXT_PUBLIC_TIME_ZONE || process.env.TZ, DEFAULT_TIME_ZONE)
}

export function parseTimestamp(value: unknown): Date | null {
  if (value == null || value === '') return null
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value

  const raw = String(value).trim()
  if (!raw) return null
  if (SQLITE_UTC_PATTERN.test(raw)) {
    const parsed = new Date(`${raw.replace(' ', 'T')}Z`)
    return Number.isNaN(parsed.getTime()) ? null : parsed
  }
  if (NAIVE_ISO_PATTERN.test(raw)) {
    const parsed = new Date(`${raw}Z`)
    return Number.isNaN(parsed.getTime()) ? null : parsed
  }

  const parsed = new Date(raw)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

export function toUtcIsoString(value: unknown): string {
  if (value == null || value === '') return ''
  const parsed = parseTimestamp(value)
  if (!parsed) return String(value)
  return parsed.toISOString()
}

export function formatDateTime(value: unknown, timeZone = resolveServerTimeZone(), options: Intl.DateTimeFormatOptions = {}): string {
  const parsed = parseTimestamp(value)
  if (!parsed) return value == null || value === '' ? '-' : String(value)
  return getFormatter('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    ...options
  }, normalizeTimeZone(timeZone)).format(parsed)
}

export function formatClock(value: unknown, timeZone = resolveServerTimeZone()): string {
  const parsed = parseTimestamp(value)
  if (!parsed) return value == null || value === '' ? '-' : String(value)
  return getFormatter('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }, normalizeTimeZone(timeZone)).format(parsed)
}

export function formatLogTimestamp(value: unknown, timeZone = resolveServerTimeZone()): string {
  const parsed = parseTimestamp(value) || new Date()
  return getFormatter('sv-SE', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }, normalizeTimeZone(timeZone)).format(parsed)
}
