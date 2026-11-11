import { basename, dirname, join, relative, resolve } from 'path'
import { readdir, stat } from 'fs/promises'
import { toUtcIsoString } from '~~/shared/time'
import { ConfigService } from './config'
import { useDb } from './db'
import { scanMediaFolder } from './fileScan'
import { getMediaRoot } from './mediaRoots'
import { VideoService } from './video'

export type CoverageStatus = 'done' | 'review' | 'processing' | 'failed' | 'missing'
export type CoverageSubtitleSource = 'sidecar' | 'embedded'

export interface CoverageFile {
  path: string
  name: string
  rootId: string
  seriesKey: string
  seriesTitle: string
  status: CoverageStatus
  targetLanguage: string
  taskId?: string
  taskStatus?: string
  subtitlePath?: string
  subtitleSource?: CoverageSubtitleSource
  matchedLanguage?: string
  embeddedTrackTitle?: string
  updatedAt?: string
}

export interface CoverageResult {
  rootId: string
  rootName: string
  targetLanguage: string
  scanned: number
  truncated: boolean
  cachedAt: string
  summary: { total: number, done: number, review: number, processing: number, failed: number, missing: number }
  series: Array<{ seriesKey: string, seriesTitle: string, files: CoverageFile[] }>
  files: CoverageFile[]
}

interface CoverageTaskRow {
  task_id?: string | null
  file_path?: string | null
  target_lang?: string | null
  status?: string | null
  output_path?: string | null
  created_at?: string | null
  updated_at?: string | null
}

interface CoverageCacheEntry {
  cachedAt: number
  result: CoverageResult
}

const COVERAGE_CACHE_TTL_MS = 60_000
const coverageCache = new Map<string, CoverageCacheEntry>()

const EMBEDDED_CACHE_TTL_MS = 10 * 60_000
const EMBEDDED_PROBE_CONCURRENCY = 3
const SIDECAR_EXTENSIONS = ['srt', 'ass', 'ssa', 'vtt']

interface EmbeddedCacheEntry {
  size: number
  mtimeMs: number
  expiresAt: number
  match: EmbeddedTrackMatch | null
}

interface EmbeddedTrackMatch {
  language: string
  title: string
}

interface SubtitleSidecarMatch {
  path: string
  language?: string
}

const embeddedSubtitleCache = new Map<string, EmbeddedCacheEntry>()

export const languageAliases: Record<string, string> = {
  zh: 'zh-CN',
  zho: 'zh-CN',
  chi: 'zh-CN',
  cmn: 'zh-CN',
  'zh-cn': 'zh-CN',
  'zh_cn': 'zh-CN',
  'zh-hans': 'zh-CN',
  'zh-hans-cn': 'zh-CN',
  chs: 'zh-CN',
  simplified: 'zh-CN',
  '简体': 'zh-CN',
  '简中': 'zh-CN',
  'zh-tw': 'zh-TW',
  'zh_hk': 'zh-TW',
  'zh-hk': 'zh-TW',
  'zh-hant': 'zh-TW',
  'zh-hant-tw': 'zh-TW',
  cht: 'zh-TW',
  traditional: 'zh-TW',
  '繁体': 'zh-TW',
  '繁體': 'zh-TW',
  '繁中': 'zh-TW',
  en: 'en',
  eng: 'en',
  english: 'en',
  ja: 'ja',
  jpn: 'ja',
  japanese: 'ja',
  ko: 'ko',
  kor: 'ko',
  korean: 'ko',
  fr: 'fr',
  fra: 'fr',
  fre: 'fr',
  french: 'fr',
  de: 'de',
  deu: 'de',
  ger: 'de',
  german: 'de',
  es: 'es',
  spa: 'es',
  spanish: 'es',
  it: 'it',
  ita: 'it',
  italian: 'it',
  pt: 'pt',
  por: 'pt',
  portuguese: 'pt',
  ru: 'ru',
  rus: 'ru',
  russian: 'ru',
  th: 'th',
  tha: 'th',
  thai: 'th',
  ar: 'ar',
  ara: 'ar',
  arabic: 'ar'
}

function normalizeLanguageToken(value: string | null | undefined) {
  return String(value || '').trim().toLowerCase().replaceAll('_', '-')
}

export function normalizeCoverageLanguage(
  language?: string | null,
  title?: string | null
): string {
  const languageToken = normalizeLanguageToken(language)
  const titleToken = normalizeLanguageToken(title)
  const combined = `${languageToken} ${titleToken}`.trim()
  if (!combined) return ''

  if (/(?:^|[^a-z])(?:zh-tw|zh-hk|zh-hant|cht|traditional)(?:[^a-z]|$)|繁体|繁體|繁中/.test(combined)) {
    return 'zh-TW'
  }
  if (/(?:^|[^a-z])(?:zh-cn|zh-hans|chs|simplified)(?:[^a-z]|$)|简体|簡體|简中/.test(combined)) {
    return 'zh-CN'
  }

  for (const candidate of [languageToken, titleToken]) {
    if (!candidate) continue
    const direct = languageAliases[candidate]
    if (direct) return direct
    const word = candidate.split(/[\s[\](){}]+/).find(part => languageAliases[part])
    if (word) return languageAliases[word]!
  }
  return ''
}

function sidecarAliases(targetLanguage: string) {
  const normalized = normalizeCoverageLanguage(targetLanguage)
  const requested = normalizeLanguageToken(targetLanguage)
  const target = normalized || requested
  const aliases = new Set<string>()
  if (target) aliases.add(target.toLowerCase())
  if (requested) aliases.add(requested)

  for (const [alias, canonical] of Object.entries(languageAliases)) {
    if (canonical === normalized && canonical) {
      aliases.add(alias.toLowerCase())
    }
  }

  for (const alias of [...aliases]) {
    aliases.add(alias.replaceAll('_', '-'))
    aliases.add(alias.replaceAll('-', '_'))
  }
  return aliases
}

function sidecarExtensionPriority(extension: string) {
  const index = SIDECAR_EXTENSIONS.indexOf(extension.toLowerCase())
  return index === -1 ? SIDECAR_EXTENSIONS.length : index
}

const PROCESSING_STATUSES = new Set([
  'queued',
  'probing',
  'extracting',
  'extracting_audio',
  'transcribing',
  'ocr',
  'parsing',
  'translating',
  'exporting',
  'paused'
])

const FAILED_STATUSES = new Set(['error', 'cancelled'])

const GENERIC_PARENT_NAMES = /^(?:media|video|videos|movie|movies|tv|shows?|anime|series)$/i
const SEASON_DIRECTORY_NAME = /^(?:season\s*\d{1,3}|s\d{1,3}|第\s*\d{1,3}\s*季)$/i

function normalizePath(value: string) {
  return String(value || '')
    .replaceAll('\\', '/')
    .replace(/\/+/g, '/')
    .replace(/^\.\/+/, '')
    .trim()
}

function splitFilePath(filePath: string) {
  const normalized = normalizePath(filePath)
  const slash = normalized.lastIndexOf('/')
  const directory = slash >= 0 ? normalized.slice(0, slash) : ''
  const fileName = slash >= 0 ? normalized.slice(slash + 1) : normalized
  const stem = fileName.replace(/\.[^.]+$/, '')
  return { directory, fileName, stem }
}

function cleanSeriesStem(stem: string) {
  const cleaned = String(stem || '')
    .replace(/(?:^|[._\-\s[\]()（【])S\d{1,2}\s*[._ -]?\s*E\d{1,4}(?=$|[._\-\s[\]()）】])/gi, ' ')
    .replace(/(?:^|[._\-\s[\]()（【])EP?\s*\d{1,4}(?=$|[._\-\s[\]()）】])/gi, ' ')
    .replace(/第\s*\d{1,5}\s*[集话話期]/g, ' ')
    .replace(/[[(（【]\s*[\])）】]/g, ' ')
    .replace(/[._]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return cleaned || String(stem || '').trim()
}

function humanizeName(value: string) {
  return String(value || '')
    .replace(/[._]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function deriveSeriesKey(filePath: string): string {
  const { directory, stem } = splitFilePath(filePath)
  const seriesStem = cleanSeriesStem(stem)
  return [directory.toLowerCase(), seriesStem.toLowerCase()].filter(Boolean).join('::')
}

export function deriveSeriesTitle(filePath: string): string {
  const { directory, stem } = splitFilePath(filePath)
  const parts = directory.split('/').filter(Boolean)
  let parent = parts[parts.length - 1] || ''
  if (SEASON_DIRECTORY_NAME.test(parent)) {
    parent = parts[parts.length - 2] || ''
  }
  if (parent && !GENERIC_PARENT_NAMES.test(parent)) {
    return humanizeName(parent) || cleanSeriesStem(stem) || stem
  }
  return cleanSeriesStem(stem) || humanizeName(stem)
}

export function deriveSeriesLabel(filePath: string): string {
  return deriveSeriesTitle(filePath)
}

export function deriveCoverageStatus(
  task: string | { status?: string | null } | null | undefined,
  subtitleExists: boolean
): CoverageStatus {
  if (!task) return subtitleExists ? 'done' : 'missing'
  const status = String(typeof task === 'string' ? task : task.status || '').trim().toLowerCase()
  if (!status) return subtitleExists ? 'done' : 'missing'
  if (status === 'review') return 'review'
  if (status === 'done') return subtitleExists ? 'done' : 'missing'
  if (PROCESSING_STATUSES.has(status)) return 'processing'
  if (FAILED_STATUSES.has(status)) return 'failed'
  return subtitleExists ? 'done' : 'missing'
}

function taskKey(filePath: string, targetLanguage: string) {
  return `${normalizePath(filePath)}\u0000${String(targetLanguage || '').trim()}`
}

function timestampValue(value: unknown) {
  if (!value) return 0
  const parsed = new Date(String(value)).getTime()
  return Number.isFinite(parsed) ? parsed : 0
}

function compareTaskRecency(a: CoverageTaskRow, b: CoverageTaskRow) {
  const createdDiff = timestampValue(a.created_at) - timestampValue(b.created_at)
  if (createdDiff !== 0) return createdDiff
  const updatedDiff = timestampValue(a.updated_at) - timestampValue(b.updated_at)
  if (updatedDiff !== 0) return updatedDiff
  return String(a.task_id || '').localeCompare(String(b.task_id || ''))
}

function loadLatestTasks(rootId: string) {
  const latest = new Map<string, CoverageTaskRow>()
  let rows: CoverageTaskRow[] = []
  try {
    const db = useDb()
    rows = db.prepare(`
      SELECT task_id, file_path, target_lang, status, output_path, created_at, updated_at
      FROM tasks
      WHERE root_id = ?
      ORDER BY created_at ASC
    `).all(rootId) as CoverageTaskRow[]
  } catch {
    rows = []
  }

  for (const row of rows) {
    if (!row || !row.file_path) continue
    const key = taskKey(row.file_path, String(row.target_lang || ''))
    const current = latest.get(key)
    if (!current || compareTaskRecency(row, current) >= 0) {
      latest.set(key, row)
    }
  }
  return latest
}

async function listSidecarCandidates(directory: string, stem: string) {
  let entries
  try {
    entries = await readdir(directory, { withFileTypes: true })
  } catch {
    return []
  }

  const stemPrefix = `${stem.toLowerCase()}.`
  const candidates: Array<{ path: string, tag: string, extension: string }> = []
  for (const entry of entries) {
    if (!entry.isFile()) continue
    const lowerName = entry.name.toLowerCase()
    if (!lowerName.startsWith(stemPrefix)) continue
    const remainder = entry.name.slice(stem.length + 1)
    const dot = remainder.lastIndexOf('.')
    const extension = (dot >= 0 ? remainder.slice(dot + 1) : remainder).toLowerCase()
    if (!SIDECAR_EXTENSIONS.includes(extension)) continue
    candidates.push({
      path: join(directory, entry.name),
      tag: dot >= 0 ? remainder.slice(0, dot).trim() : '',
      extension
    })
  }
  return candidates
}

async function findExistingSubtitle(
  videoAbsolutePath: string,
  targetLanguage: string
): Promise<SubtitleSidecarMatch | null> {
  const directory = dirname(videoAbsolutePath)
  const stem = basename(videoAbsolutePath).replace(/\.[^.]+$/, '')
  const normalizedTarget = normalizeCoverageLanguage(targetLanguage) || normalizeLanguageToken(targetLanguage)
  const aliases = sidecarAliases(targetLanguage)
  const directories = [directory, join(directory, 'SubX')]

  const tagged: Array<{ path: string, language: string, directoryIndex: number, extension: string }> = []
  const generic: Array<{ path: string, directoryIndex: number, extension: string }> = []

  for (let directoryIndex = 0; directoryIndex < directories.length; directoryIndex += 1) {
    const candidates = await listSidecarCandidates(directories[directoryIndex]!, stem)
    for (const candidate of candidates) {
      if (!candidate.tag) {
        generic.push({ path: candidate.path, directoryIndex, extension: candidate.extension })
        continue
      }
      if (/\bforced\b|强制/i.test(candidate.tag)) continue
      const tag = normalizeLanguageToken(candidate.tag)
      const normalizedTag = normalizeCoverageLanguage(candidate.tag)
      const matchesAlias = aliases.has(tag) || aliases.has(tag.replaceAll('_', '-'))
      if (matchesAlias || (normalizedTarget && normalizedTag === normalizedTarget)) {
        tagged.push({
          path: candidate.path,
          language: normalizedTag || normalizedTarget,
          directoryIndex,
          extension: candidate.extension
        })
      }
    }
  }

  const compare = (
    a: { directoryIndex: number, extension: string, path: string },
    b: { directoryIndex: number, extension: string, path: string }
  ) => (
    a.directoryIndex - b.directoryIndex
    || sidecarExtensionPriority(a.extension) - sidecarExtensionPriority(b.extension)
    || a.path.localeCompare(b.path)
  )

  if (tagged.length) {
    tagged.sort(compare)
    return { path: tagged[0]!.path, language: tagged[0]!.language }
  }
  if (generic.length) {
    generic.sort(compare)
    return { path: generic[0]!.path }
  }
  return null
}

async function findEmbeddedSubtitle(
  videoPath: string,
  rootId: string,
  videoAbsolutePath: string,
  normalizedTarget: string
): Promise<EmbeddedTrackMatch | null> {
  let size = 0
  let mtimeMs = 0
  try {
    const stats = await stat(videoAbsolutePath)
    size = stats.size
    mtimeMs = stats.mtimeMs
  } catch {
    size = 0
    mtimeMs = 0
  }

  const cacheKey = `${videoAbsolutePath}\u0000${size}\u0000${mtimeMs}\u0000${normalizedTarget}`
  const now = Date.now()
  const cached = embeddedSubtitleCache.get(cacheKey)
  if (cached && cached.expiresAt > now) return cached.match

  let match: EmbeddedTrackMatch | null = null
  try {
    const media = await VideoService.probeMedia(videoPath, rootId)
    const track = (media.subtitleTracks || []).find((item) => (
      !item.isForced
      && normalizeCoverageLanguage(item.language, item.title) === normalizedTarget
    ))
    if (track) {
      match = {
        language: normalizeCoverageLanguage(track.language, track.title) || normalizedTarget,
        title: String(track.title || track.language || '').trim()
      }
    }
  } catch {
    match = null
  }

  embeddedSubtitleCache.set(cacheKey, {
    size,
    mtimeMs,
    expiresAt: now + EMBEDDED_CACHE_TTL_MS,
    match
  })
  return match
}

async function mapWithConcurrency<T, R>(
  items: readonly T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length)
  let nextIndex = 0
  const workerCount = Math.max(1, Math.min(concurrency, items.length))
  const workers = Array.from({ length: workerCount }, async () => {
    while (true) {
      const index = nextIndex
      nextIndex += 1
      if (index >= items.length) return
      results[index] = await mapper(items[index]!, index)
    }
  })
  await Promise.all(workers)
  return results
}

export function clearLibraryCoverageCache() {
  coverageCache.clear()
}

export function clearEmbeddedSubtitleCache() {
  embeddedSubtitleCache.clear()
}

export async function buildLibraryCoverage(
  rootId: string,
  options: { targetLanguage?: string, refresh?: boolean, includeEmbedded?: boolean } = {}
): Promise<CoverageResult> {
  const requestedLanguage = String(options.targetLanguage || '').trim()
  const targetLanguage = requestedLanguage
    || String((await ConfigService.getConfig()).targetLanguage || 'zh-CN').trim()
    || 'zh-CN'
  const normalizedTarget = normalizeCoverageLanguage(targetLanguage) || normalizeLanguageToken(targetLanguage)
  const includeEmbedded = options.includeEmbedded !== false

  const cacheKey = `${rootId}\u0000${targetLanguage}\u0000${includeEmbedded ? '1' : '0'}`
  const cached = coverageCache.get(cacheKey)
  if (!options.refresh && cached && Date.now() - cached.cachedAt < COVERAGE_CACHE_TTL_MS) {
    return cached.result
  }

  const [root, scanned] = await Promise.all([
    getMediaRoot(rootId),
    scanMediaFolder(rootId, '')
  ])
  const rootPath = resolve(root.path)
  const latestTasks = loadLatestTasks(rootId)

  const files = await mapWithConcurrency(scanned.files, EMBEDDED_PROBE_CONCURRENCY, async (video) => {
    const absoluteVideoPath = resolve(rootPath, video.path)
    const sidecar = await findExistingSubtitle(absoluteVideoPath, targetLanguage)
    const embedded = !sidecar && includeEmbedded
      ? await findEmbeddedSubtitle(video.path, video.rootId || root.id, absoluteVideoPath, normalizedTarget)
      : null
    const task = latestTasks.get(taskKey(video.path, targetLanguage))
    const seriesKey = deriveSeriesKey(video.path)
    const seriesTitle = deriveSeriesTitle(video.path)
    const status = deriveCoverageStatus(task, Boolean(sidecar || embedded))
    const updatedAt = task ? toUtcIsoString(task.updated_at || task.created_at) : ''
    const subtitlePath = sidecar
      ? relative(rootPath, sidecar.path).replaceAll('\\', '/')
      : ''

    return {
      path: video.path,
      name: video.name,
      rootId: video.rootId || root.id,
      seriesKey,
      seriesTitle,
      status,
      targetLanguage,
      ...(task?.task_id ? { taskId: String(task.task_id) } : {}),
      ...(task?.status ? { taskStatus: String(task.status) } : {}),
      ...(subtitlePath ? { subtitlePath, subtitleSource: 'sidecar' as const } : {}),
      ...(sidecar?.language ? { matchedLanguage: sidecar.language } : {}),
      ...(embedded
        ? {
            subtitleSource: 'embedded' as const,
            matchedLanguage: embedded.language,
            ...(embedded.title ? { embeddedTrackTitle: embedded.title } : {})
          }
        : {}),
      ...(updatedAt ? { updatedAt } : {})
    }
  })

  files.sort((a, b) => a.path.localeCompare(b.path, 'zh-CN'))

  const summary = {
    total: files.length,
    done: 0,
    review: 0,
    processing: 0,
    failed: 0,
    missing: 0
  }
  for (const file of files) summary[file.status] += 1

  const seriesMap = new Map<string, { seriesKey: string, seriesTitle: string, files: CoverageFile[] }>()
  for (const file of files) {
    let group = seriesMap.get(file.seriesKey)
    if (!group) {
      group = { seriesKey: file.seriesKey, seriesTitle: file.seriesTitle, files: [] }
      seriesMap.set(file.seriesKey, group)
    }
    group.files.push(file)
  }

  const series = Array.from(seriesMap.values())
    .sort((a, b) => (
      a.seriesTitle.localeCompare(b.seriesTitle, 'zh-CN')
      || a.seriesKey.localeCompare(b.seriesKey, 'zh-CN')
    ))
  for (const group of series) {
    group.files.sort((a, b) => a.path.localeCompare(b.path, 'zh-CN'))
  }

  const result: CoverageResult = {
    rootId: scanned.rootId || root.id,
    rootName: scanned.rootName || root.name,
    targetLanguage,
    scanned: Number(scanned.total ?? scanned.files.length),
    truncated: Boolean(scanned.truncated),
    cachedAt: new Date().toISOString(),
    summary,
    series,
    files
  }

  coverageCache.set(cacheKey, { cachedAt: Date.now(), result })
  return result
}
