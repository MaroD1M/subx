import { describe, expect, it } from 'vitest'
import { fileNameMatchesLanguage, resolveTrackPolicy, selectTrackForPolicy, trackMatchesLanguage } from '../trackPolicy'
import type { TrackInfo } from '~~/types'

function track(index: number, language: string, options: Partial<TrackInfo> = {}): TrackInfo {
  return { index, codec: 'subrip', language, isSupported: true, ...options }
}

describe('batch track policy', () => {
  it('preserves legacy forced-track fallback when no policy is supplied', () => {
    const policy = resolveTrackPolicy(undefined)
    expect(policy.allowForcedSubtitle).toBe(true)
    expect(policy.preferDefault).toBe(true)
    expect(policy.fallbackToAsr).toBe(true)
  })

  it('matches language tags and aliases', () => {
    expect(trackMatchesLanguage(track(0, 'zh-CN'), 'zh')).toBe(true)
    expect(trackMatchesLanguage(track(0, 'chi'), 'zh')).toBe(true)
    expect(trackMatchesLanguage(track(0, 'und', { title: 'English SDH' }), 'en')).toBe(true)
    expect(trackMatchesLanguage(track(0, 'ja'), 'zh')).toBe(false)
  })

  it('prefers the requested non-forced language', () => {
    const policy = resolveTrackPolicy({ subtitleLanguage: 'zh', allowForcedSubtitle: false })
    const selected = selectTrackForPolicy([
      track(0, 'en', { isDefault: true }),
      track(1, 'zh')
    ], policy, 'subtitle')
    expect(selected?.index).toBe(1)
  })

  it('does not choose a forced preferred track when a full alternative exists', () => {
    const policy = resolveTrackPolicy({ subtitleLanguage: 'zh', allowForcedSubtitle: true })
    const selected = selectTrackForPolicy([
      track(0, 'zh', { isForced: true }),
      track(1, 'en')
    ], policy, 'subtitle')
    expect(selected?.index).toBe(1)
  })

  it('honors default-track preference within the preferred language', () => {
    const policy = resolveTrackPolicy({ subtitleLanguage: 'zh' })
    const selected = selectTrackForPolicy([
      track(0, 'zh'),
      track(1, 'zh', { isDefault: true })
    ], policy, 'subtitle')
    expect(selected?.index).toBe(1)
  })

  it('matches sidecar language tokens', () => {
    expect(fileNameMatchesLanguage('Show.S01E01.zh-CN.srt', 'zh')).toBe(true)
    expect(fileNameMatchesLanguage('Show.S01E01.eng.ass', 'en')).toBe(true)
    expect(fileNameMatchesLanguage('Show.S01E01.srt', 'zh')).toBe(false)
  })
})
