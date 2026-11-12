import { basename, dirname } from 'path'
import { useDb } from './db'
import { outboundFetch } from './notificationTransport'

export interface MetadataEnrichment {
  provider: 'tmdb'
  mediaType: 'movie' | 'tv'
  title: string
  originalTitle?: string
  year?: string
  season?: number
  episode?: number
  episodeTitle?: string
  overview: string
  source: 'cache' | 'tmdb'
}

interface MediaHint {
  mediaType: 'movie' | 'tv'
  title: string
  year?: string
  season?: number
  episode?: number
}

const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000
const TMDB_BASE = 'https://api.themoviedb.org/3'
let circuitOpenUntil = 0

function cleanTitle(value: string) {
  return String(value || '')
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\b(?:2160p|1080p|720p|480p|4k|uhd|bluray|blu-ray|web-dl|webrip|hdtv|dvdrip|remux|hevc|h\.?264|h\.?265|x264|x265|aac|dts|truehd|atmos|10bit|hdr|dv|proper|repack)\b/gi, ' ')
    .replace(/[._-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function parseMediaHint(filePath: string): MediaHint {
  const stem = basename(String(filePath || '')).replace(/\.[^.]+$/, '')
  const seasonEpisode = stem.match(/(?:^|[\s._-])S(\d{1,2})[\s._-]*E(\d{1,3})(?:[\s._-]|$)/i)
  const chineseEpisode = stem.match(/第\s*(\d{1,4})\s*[集话話]/)
  const episodeOnly = stem.match(/(?:^|[\s._-])(?:EP|E)(\d{1,4})(?:[\s._-]|$)/i)
  const yearMatch = stem.match(/(?:^|[\s._([])((?:19|20)\d{2})(?:[\s._)\]]|$)/)
  const year = yearMatch?.[1]
  const season = seasonEpisode ? Number(seasonEpisode[1]) : undefined
  const episode = seasonEpisode ? Number(seasonEpisode[2]) : (chineseEpisode ? Number(chineseEpisode[1]) : (episodeOnly ? Number(episodeOnly[1]) : undefined))
  const mediaType: 'movie' | 'tv' = seasonEpisode || chineseEpisode || episodeOnly ? 'tv' : 'movie'
  const stripped = cleanTitle(stem
    .replace(/(?:^|[\s._-])S\d{1,2}[\s._-]*E\d{1,3}.*$/i, '')
    .replace(/第\s*\d{1,4}\s*[集话話].*$/, '')
    .replace(/(?:^|[\s._-])(?:EP|E)\d{1,4}.*$/i, '')
    .replace(/(?:^|[\s._([])(?:19|20)\d{2}(?:[\s._)\]]|$).*$/, ''))
  const parentTitle = cleanTitle(basename(dirname(String(filePath || ''))))
  return {
    mediaType,
    title: stripped || parentTitle || cleanTitle(stem),
    year,
    season,
    episode
  }
}

function cacheGet(key: string): MetadataEnrichment | null {
  try {
    const row = useDb().prepare('SELECT payload_json, expires_at FROM media_metadata_cache WHERE cache_key = ?').get(key) as { payload_json?: string, expires_at?: string } | undefined
    if (!row?.payload_json) return null
    if (row.expires_at && Date.parse(String(row.expires_at)) < Date.now()) return null
    return { ...JSON.parse(row.payload_json), source: 'cache' }
  } catch {
    return null
  }
}

function cacheSet(key: string, value: MetadataEnrichment) {
  try {
    const expires = new Date(Date.now() + CACHE_TTL_MS).toISOString()
    useDb().prepare(`
      INSERT INTO media_metadata_cache (cache_key, payload_json, expires_at, created_at)
      VALUES (?, ?, ?, datetime('now'))
      ON CONFLICT(cache_key) DO UPDATE SET payload_json=excluded.payload_json, expires_at=excluded.expires_at
    `).run(key, JSON.stringify({ ...value, source: 'tmdb' }), expires)
  } catch { /* cache is best-effort */ }
}

async function tmdbFetch(path: string, apiKey: string) {
  const response = await outboundFetch('TMDB', `${TMDB_BASE}${path}${path.includes('?') ? '&' : '?'}api_key=${encodeURIComponent(apiKey)}`, {
    signal: AbortSignal.timeout(5_000),
    headers: { accept: 'application/json' }
  })
  if (!response.ok) throw new Error(`TMDB ${response.status}`)
  return response.json() as Promise<any>
}

function joinOverview(...parts: Array<string | undefined>) {
  return parts.map(part => String(part || '').trim()).filter(Boolean).join('\n\n').slice(0, 4000)
}

export const MetadataService = {
  parseMediaHint,

  async enrich(
    filePath: string,
    config: any,
    options: { query?: string, manual?: boolean } = {}
  ): Promise<MetadataEnrichment | null> {
    if (!options.manual && config?.metadataEnabled !== true) return null
    const apiKey = String(config?.metadataApiKey || '').trim()
    if (!apiKey) return null
    if (!options.manual && Date.now() < circuitOpenUntil) return null
    if (options.manual) circuitOpenUntil = 0
    const language = String(config?.metadataLanguage || 'zh-CN')
    const hint = parseMediaHint(filePath)
    const manualQuery = cleanTitle(String(options.query || '')).slice(0, 200)
    if (manualQuery) {
      const queryHint = parseMediaHint(`${manualQuery}.mkv`)
      hint.title = queryHint.title || manualQuery
      if (queryHint.year) hint.year = queryHint.year
      if (queryHint.season !== undefined && queryHint.episode !== undefined) {
        hint.mediaType = 'tv'
        hint.season = queryHint.season
        hint.episode = queryHint.episode
      } else if (queryHint.mediaType === 'tv' && hint.mediaType !== 'tv') {
        hint.mediaType = 'tv'
      }
    }
    if (!hint.title) return null
    const cacheKey = `tmdb:${hint.mediaType}:${hint.title.toLowerCase()}:${hint.year || ''}:${hint.season ?? ''}:${hint.episode ?? ''}:${language}`
    const cached = cacheGet(cacheKey)
    if (cached) return cached

    try {
      if (hint.mediaType === 'tv') {
        const search = await tmdbFetch(`/search/tv?language=${encodeURIComponent(language)}&query=${encodeURIComponent(hint.title)}${hint.year ? `&first_air_date_year=${hint.year}` : ''}`, apiKey)
        const match = Array.isArray(search?.results) ? search.results[0] : null
        if (!match?.id) return null
        const series = await tmdbFetch(`/tv/${match.id}?language=${encodeURIComponent(language)}`, apiKey)
        let episodeTitle = ''
        let episodeOverview = ''
        if (hint.season && hint.episode) {
          try {
            const episode = await tmdbFetch(`/tv/${match.id}/season/${hint.season}/episode/${hint.episode}?language=${encodeURIComponent(language)}`, apiKey)
            episodeTitle = String(episode?.name || '')
            episodeOverview = String(episode?.overview || '')
          } catch { /* episode details are optional */ }
        }
        const titleParts = [String(series?.name || hint.title)]
        if (hint.season && hint.episode) titleParts.push(`S${String(hint.season).padStart(2, '0')}E${String(hint.episode).padStart(2, '0')}`)
        if (episodeTitle) titleParts.push(episodeTitle)
        const result: MetadataEnrichment = {
          provider: 'tmdb',
          mediaType: 'tv',
          title: titleParts.join(' · '),
          originalTitle: String(series?.original_name || ''),
          year: String(series?.first_air_date || '').slice(0, 4) || hint.year,
          season: hint.season,
          episode: hint.episode,
          episodeTitle,
          overview: joinOverview(episodeOverview, series?.overview),
          source: 'tmdb'
        }
        cacheSet(cacheKey, result)
        return result
      }

      const search = await tmdbFetch(`/search/movie?language=${encodeURIComponent(language)}&query=${encodeURIComponent(hint.title)}${hint.year ? `&year=${hint.year}` : ''}`, apiKey)
      const match = Array.isArray(search?.results) ? search.results[0] : null
      if (!match?.id) return null
      const movie = await tmdbFetch(`/movie/${match.id}?language=${encodeURIComponent(language)}`, apiKey)
      const result: MetadataEnrichment = {
        provider: 'tmdb',
        mediaType: 'movie',
        title: String(movie?.title || hint.title),
        originalTitle: String(movie?.original_title || ''),
        year: String(movie?.release_date || '').slice(0, 4) || hint.year,
        overview: joinOverview(movie?.overview),
        source: 'tmdb'
      }
      cacheSet(cacheKey, result)
      return result
    } catch (error: any) {
      circuitOpenUntil = Date.now() + 5 * 60_000
      console.warn('[Metadata] TMDB lookup failed, pausing lookups for 5 minutes:', error?.message || error)
      return null
    }
  },

  async test(apiKey: string, language = 'zh-CN') {
    if (!apiKey) throw new Error('请先填写 TMDB API Key')
    const result = await tmdbFetch(`/configuration?language=${encodeURIComponent(language)}`, apiKey)
    return { ok: Boolean(result?.images), language }
  }
}
