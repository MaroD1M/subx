import type { TrackInfo, TrackPolicy } from '~~/types'

const LANGUAGE_ALIASES: Record<string, string[]> = {
  zh: ['zh', 'chi', 'zho', 'chs', 'cht', 'cmn', 'chinese', '中文', '简体', '繁体'],
  en: ['en', 'eng', 'english', '英文', '英语'],
  ja: ['ja', 'jpn', 'japanese', '日文', '日语'],
  ko: ['ko', 'kor', 'korean', '韩文', '韩语']
}

export interface ResolvedTrackPolicy {
  subtitleLanguage: string
  audioLanguage: string
  preferDefault: boolean
  allowForcedSubtitle: boolean
  fallbackToAsr: boolean
}

export function resolveTrackPolicy(policy?: TrackPolicy): ResolvedTrackPolicy {
  const hasPolicy = Boolean(policy && Object.keys(policy).length)
  return {
    subtitleLanguage: String(policy?.subtitleLanguage || '').trim().toLowerCase(),
    audioLanguage: String(policy?.audioLanguage || '').trim().toLowerCase(),
    preferDefault: policy?.preferDefault !== false,
    allowForcedSubtitle: hasPolicy ? policy?.allowForcedSubtitle === true : true,
    fallbackToAsr: policy?.fallbackToAsr !== false
  }
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function languageAliases(preferred: string) {
  return LANGUAGE_ALIASES[preferred] || [preferred]
}

export function trackMatchesLanguage(track: TrackInfo, preferred: string) {
  if (!preferred) return false
  const language = String(track.language || '').toLowerCase()
  const title = String(track.title || '').toLowerCase()
  return languageAliases(preferred).some((alias) => {
    const normalized = alias.toLowerCase()
    const escaped = escapeRegExp(normalized)
    return language === normalized
      || language.startsWith(`${normalized}-`)
      || language.startsWith(`${normalized}_`)
      || new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`).test(title)
  })
}

export function fileNameMatchesLanguage(name: string, preferred: string) {
  if (!preferred) return false
  const lower = name.toLowerCase()
  return languageAliases(preferred).some((alias) => {
    const escaped = escapeRegExp(alias.toLowerCase())
    return new RegExp(`(^|[.\\s_-])${escaped}([.\\s_-]|$)`).test(lower)
  })
}

export function selectTrackForPolicy(tracks: TrackInfo[], policy: ResolvedTrackPolicy, kind: 'subtitle' | 'audio') {
  const allowForced = kind === 'audio' || policy.allowForcedSubtitle
  const candidates = tracks.filter(track => allowForced || !track.isForced)
  if (!candidates.length) return undefined

  const preferredLanguage = kind === 'subtitle' ? policy.subtitleLanguage : policy.audioLanguage
  const nonForced = candidates.filter(track => !track.isForced)
  const languageMatches = preferredLanguage
    ? candidates.filter(track => trackMatchesLanguage(track, preferredLanguage))
    : []
  const nonForcedLanguageMatches = languageMatches.filter(track => !track.isForced)
  const pool = nonForcedLanguageMatches.length
    ? nonForcedLanguageMatches
    : nonForced.length
      ? nonForced
      : languageMatches.length
        ? languageMatches
        : candidates

  if (!policy.preferDefault) return pool.find(track => !track.isForced) || pool[0]
  return pool.find(track => track.isDefault && !track.isForced)
    || pool.find(track => !track.isForced)
    || pool.find(track => track.isDefault)
    || pool[0]
}
