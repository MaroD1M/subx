import { basename, dirname, join, relative, resolve } from 'path'
import { existsSync, statSync } from 'fs'
import { toUtcIsoString } from '~~/shared/time'
import { ConfigService } from './config'
import { useDb } from './db'
import { scanMediaFolder } from './fileScan'
import { getMediaRoot } from './mediaRoots'

export type CoverageStatus = 'done' | 'review' | 'processing' | 'failed' | 'missing'

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

function findExistingSubtitle(videoAbsolutePath: string, targetLanguage: string) {
  const directory = dirname(videoAbsolutePath)
  const stem = basename(videoAbsolutePath).replace(/\.[^.]+$/, '')
  const language = String(targetLanguage || '').trim()
  const candidates = [
    join(directory, `${stem}.srt`),
    join(directory, `${stem}.ass`),
    join(directory, 'SubX', `${stem}.${language}.srt`),
    join(directory, 'SubX', `${stem}.${language}.ass`),
    join(directory, 'SubX', `${stem}.srt`),
    join(directory, 'SubX', `${stem}.ass`)
  ]

  for (const candidate of candidates) {
    try {
      if (existsSync(candidate) && statSync(candidate).isFile()) return candidate
    } catch {
      continue
    }
  }
  return null
}

export function clearLibraryCoverageCache() {
  coverageCache.clear()
}

export async function buildLibraryCoverage(
  rootId: string,
  options: { targetLanguage?: string, refresh?: boolean } = {}
): Promise<CoverageResult> {
  const requestedLanguage = String(options.targetLanguage || '').trim()
  const targetLanguage = requestedLanguage
    || String((await ConfigService.getConfig()).targetLanguage || 'zh-CN').trim()
    || 'zh-CN'

  const cacheKey = `${rootId}\u0000${targetLanguage}`
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

  const files: CoverageFile[] = scanned.files.map((video) => {
    const absoluteVideoPath = resolve(rootPath, video.path)
    const subtitleAbsolutePath = findExistingSubtitle(absoluteVideoPath, targetLanguage)
    const task = latestTasks.get(taskKey(video.path, targetLanguage))
    const seriesKey = deriveSeriesKey(video.path)
    const seriesTitle = deriveSeriesTitle(video.path)
    const status = deriveCoverageStatus(task, Boolean(subtitleAbsolutePath))
    const updatedAt = task ? toUtcIsoString(task.updated_at || task.created_at) : ''
    const subtitlePath = subtitleAbsolutePath
      ? relative(rootPath, subtitleAbsolutePath).replaceAll('\\', '/')
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
      ...(subtitlePath ? { subtitlePath } : {}),
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
