import { useDb } from './db'
import { toUtcIsoString } from '~~/shared/time'
import type { SeriesProfile, TranslationTask } from '~~/types'

const MAX_GLOSSARY_ENTRIES = 200
const MAX_GLOSSARY_KEY_LENGTH = 200
const MAX_GLOSSARY_VALUE_LENGTH = 2000

function normalizePath(filePath: string): string {
  return String(filePath || '').replace(/\\/g, '/').replace(/\/+/g, '/').trim()
}

function fileStem(filePath: string): string {
  const normalized = normalizePath(filePath)
  const base = normalized.split('/').filter(Boolean).pop() || ''
  const dotIndex = base.lastIndexOf('.')
  return dotIndex > 0 ? base.slice(0, dotIndex) : base
}

export function stripEpisodeMarkers(value: string): string {
  let result = String(value || '')
  const patterns = [
    /(?:^|[._\-\s[\]()（【])S\d{1,2}\s*[._ -]?\s*E\d{1,4}(?=$|[._\-\s[\]()）】])/gi,
    /(?:^|[._\-\s[\]()（【])EP?\s*\d{1,4}(?=$|[._\-\s[\]()）】])/gi,
    /第\s*\d{1,5}\s*[集话話期]/g
  ]
  for (const pattern of patterns) {
    result = result.replace(pattern, ' ')
  }
  return result
    .replace(/[[(（【]\s*[\])）】]/g, ' ')
    .replace(/[._]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function normalizeSeriesDirectory(directory: string): string {
  const parts = normalizePath(directory).split('/').filter(Boolean)
  if (parts.length > 0) {
    const last = parts[parts.length - 1] || ''
    if (/^(?:season\s*\d{1,3}|s\d{1,3}|第\s*\d{1,3}\s*季)$/i.test(last.trim())) {
      parts.pop()
    }
  }
  return parts.join('/')
}

export function inferSeriesTitle(filePath: string): string {
  const stem = fileStem(filePath)
  const cleaned = stripEpisodeMarkers(stem)
  return (cleaned || stem)
    .replace(/[._\-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function seriesKeyFromPath(filePath: string, rootId?: string): string {
  const normalized = normalizePath(filePath)
  const segments = normalized.split('/').filter(Boolean)
  const fileName = segments.pop() || ''
  const directory = normalizeSeriesDirectory(segments.join('/'))
  const rawStem = fileStem(fileName || normalized)
  const seriesStem = stripEpisodeMarkers(rawStem) || rawStem || fileName
  const root = String(rootId || '').trim()
  const parts = [root, directory, seriesStem].filter(part => Boolean(String(part || '').trim()))
  return parts.join('|')
}

export function sanitizeGlossary(input: unknown): Record<string, string> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {}
  const result: Record<string, string> = {}
  for (const [rawKey, rawValue] of Object.entries(input as Record<string, unknown>).slice(0, MAX_GLOSSARY_ENTRIES)) {
    const key = String(rawKey ?? '').trim().slice(0, MAX_GLOSSARY_KEY_LENGTH)
    if (!key) continue
    result[key] = String(rawValue ?? '').trim().slice(0, MAX_GLOSSARY_VALUE_LENGTH)
  }
  return result
}

function mapProfile(row: any): SeriesProfile | null {
  if (!row) return null
  let glossary: Record<string, string> = {}
  try {
    glossary = sanitizeGlossary(JSON.parse(String(row.glossary_json || '{}')))
  } catch {
    glossary = {}
  }
  return {
    seriesKey: String(row.series_key || ''),
    rootId: row.root_id ? String(row.root_id) : undefined,
    title: String(row.title || ''),
    background: String(row.background || ''),
    glossary,
    summary: String(row.summary || ''),
    lastTaskId: row.last_task_id ? String(row.last_task_id) : undefined,
    createdAt: row.created_at ? toUtcIsoString(row.created_at) : undefined,
    updatedAt: row.updated_at ? toUtcIsoString(row.updated_at) : undefined
  }
}

export interface SeriesProfileInput {
  rootId?: string
  filePath?: string
  seriesKey?: string
  title?: string
  background?: string
  glossary?: Record<string, string>
  summary?: string
  lastTaskId?: string
}

export interface SeriesTranslationContext {
  glossary: Record<string, string>
  title: string
  background: string
  instructions: string
}

export function resolveSeriesTranslationContext(
  task: Partial<TranslationTask> | null | undefined,
  configGlossary: Record<string, string> | null | undefined,
  profile: SeriesProfile | null | undefined
): SeriesTranslationContext {
  const glossary = {
    ...(configGlossary || {}),
    ...(profile?.glossary || {})
  }
  const title = String(task?.contentTitle || profile?.title || '')
  const taskBackground = String(task?.contentBackground || '')
  const profileBackground = String(profile?.background || '')
  const summary = String(profile?.summary || '').trim()
  const baseBackground = taskBackground || profileBackground
  const background = summary
    ? [baseBackground, summary].filter(Boolean).join('\n\n')
    : baseBackground
  return {
    glossary,
    title,
    background,
    instructions: String(task?.customInstructions || '')
  }
}

export const SeriesService = {
  getProfile(rootId: string | undefined, filePath: string): SeriesProfile | null {
    if (!filePath) return null
    return this.getProfileByKey(seriesKeyFromPath(filePath, rootId))
  },

  getProfileByKey(seriesKey: string): SeriesProfile | null {
    const key = String(seriesKey || '').trim()
    if (!key) return null
    const db = useDb()
    const row = db.prepare('SELECT * FROM series_profiles WHERE series_key = ?').get(key)
    return mapProfile(row)
  },

  saveProfile(input: SeriesProfileInput): SeriesProfile {
    const seriesKey = String(input.seriesKey || '').trim()
      || (input.filePath ? seriesKeyFromPath(input.filePath, input.rootId) : '')
    if (!seriesKey) {
      throw new Error('seriesKey or filePath is required')
    }

    const existing = this.getProfileByKey(seriesKey)
    const inferredTitle = input.filePath ? inferSeriesTitle(input.filePath) : ''
    const rootId = input.rootId !== undefined
      ? (String(input.rootId || '').trim() || null)
      : (existing?.rootId || null)
    const title = input.title !== undefined ? String(input.title) : (existing?.title ?? inferredTitle)
    const background = input.background !== undefined ? String(input.background) : (existing?.background ?? '')
    const glossary = input.glossary !== undefined ? sanitizeGlossary(input.glossary) : (existing?.glossary || {})
    const summary = input.summary !== undefined ? String(input.summary) : (existing?.summary ?? '')
    const lastTaskId = input.lastTaskId !== undefined
      ? (String(input.lastTaskId || '').trim() || null)
      : (existing?.lastTaskId || null)

    const db = useDb()
    db.prepare(`
      INSERT INTO series_profiles (
        series_key, root_id, title, background, glossary_json, summary, last_task_id, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
      ON CONFLICT(series_key) DO UPDATE SET
        root_id = excluded.root_id,
        title = excluded.title,
        background = excluded.background,
        glossary_json = excluded.glossary_json,
        summary = excluded.summary,
        last_task_id = excluded.last_task_id,
        updated_at = datetime('now')
    `).run(seriesKey, rootId, title, background, JSON.stringify(glossary), summary, lastTaskId)

    return this.getProfileByKey(seriesKey)!
  },

  ensureProfile(rootId: string | undefined, filePath: string): SeriesProfile {
    const existing = this.getProfile(rootId, filePath)
    if (existing) return existing
    return this.saveProfile({ rootId, filePath, title: inferSeriesTitle(filePath) })
  },

  listProfiles(): SeriesProfile[] {
    const db = useDb()
    const rows = db.prepare('SELECT * FROM series_profiles ORDER BY updated_at DESC, series_key ASC').all() as any[]
    return rows.map(row => mapProfile(row)).filter((profile): profile is SeriesProfile => Boolean(profile))
  },

  updateFromTask(rootId: string | undefined, filePath: string, taskId: string, title?: string, background?: string): SeriesProfile {
    const existing = this.getProfile(rootId, filePath)
    const inferredTitle = inferSeriesTitle(filePath)
    const patch: SeriesProfileInput = {
      rootId,
      filePath,
      lastTaskId: taskId
    }
    const canReplaceTitle = !existing?.title?.trim() || existing.title.trim() === inferredTitle
    if (title !== undefined && String(title).trim() && canReplaceTitle) patch.title = String(title)
    if (background !== undefined && String(background).trim() && !existing?.background?.trim()) patch.background = String(background)
    return this.saveProfile(patch)
  }
}
