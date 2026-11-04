import { describe, expect, it } from 'vitest'
import {
  DEFAULT_TIME_ZONE,
  formatClock,
  formatLogTimestamp,
  formatDateTime,
  normalizeTimeZone,
  parseTimestamp,
  toUtcIsoString
} from '../../shared/time'

describe('time utilities', () => {
  it('treats SQLite naive timestamps as UTC', () => {
    expect(parseTimestamp('2026-11-04 05:00:00')?.toISOString()).toBe('2026-11-04T05:00:00.000Z')
    expect(toUtcIsoString('2026-11-04 05:00:00')).toBe('2026-11-04T05:00:00.000Z')
    expect(toUtcIsoString('2026-11-04T05:00:00')).toBe('2026-11-04T05:00:00.000Z')
    expect(toUtcIsoString('2026-11-04T13:00:00+08:00')).toBe('2026-11-04T05:00:00.000Z')
  })

  it('formats timestamps in the requested timezone', () => {
    expect(formatDateTime('2026-11-04 05:00:00', 'Asia/Shanghai')).toContain('13:00')
    expect(formatDateTime('2026-11-04T05:00:00Z', 'UTC')).toContain('05:00')
    expect(formatClock('2026-11-04 05:00:00', 'Asia/Shanghai')).toBe('13:00:00')
    expect(formatLogTimestamp('2026-11-04 05:00:00', 'Asia/Shanghai')).toBe('2026-11-04 13:00:00')
  })

  it('uses TZ environment as the server-side default', () => {
    const previousTz = process.env.TZ
    const previousPublic = process.env.NUXT_PUBLIC_TIME_ZONE
    try {
      delete process.env.NUXT_PUBLIC_TIME_ZONE
      process.env.TZ = 'UTC'
      expect(formatDateTime('2026-11-04 05:00:00')).toContain('05:00')
      process.env.TZ = 'Asia/Shanghai'
      expect(formatDateTime('2026-11-04 05:00:00')).toContain('13:00')
    } finally {
      if (previousTz === undefined) delete process.env.TZ
      else process.env.TZ = previousTz
      if (previousPublic === undefined) delete process.env.NUXT_PUBLIC_TIME_ZONE
      else process.env.NUXT_PUBLIC_TIME_ZONE = previousPublic
    }
  })

  it('falls back for invalid timezone and invalid values', () => {
    expect(normalizeTimeZone('Not/AZone')).toBe(DEFAULT_TIME_ZONE)
    expect(normalizeTimeZone('')).toBe(DEFAULT_TIME_ZONE)
    expect(formatDateTime('')).toBe('-')
    expect(toUtcIsoString('not-a-date')).toBe('not-a-date')
  })
})
