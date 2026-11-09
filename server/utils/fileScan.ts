import { basename, dirname, join, normalize, relative, resolve } from 'path'
import { lstat, readdir, stat } from 'fs/promises'
import { createError } from 'h3'
import { getMediaRoot, resolveMediaPath } from './mediaRoots'
import { resolveInsideRoot } from './pathSafety'

export const VIDEO_EXTENSIONS = ['.mkv', '.mp4', '.avi', '.webm', '.ts', '.m2ts', '.mts', '.mov']
export const SUBTITLE_EXTENSIONS = ['.srt', '.ass', '.ssa', '.vtt']
const MAX_SCAN_FILES = 5000
const MAX_SCAN_DEPTH = 24
const MAX_SEARCH_ENTRIES = 20000

export interface BatchFileEntry {
  path: string
  rootId?: string
}

export interface ScannedFile {
  name: string
  path: string
  isDir: false
  rootId: string
  rootName: string
  size: number
}

function extensionOf(name: string) {
  return name.toLowerCase().match(/\.[^.]+$/)?.[0] || ''
}

export function isVideoFile(name: string) {
  return VIDEO_EXTENSIONS.includes(extensionOf(name))
}

export function isSubtitleFile(name: string) {
  return SUBTITLE_EXTENSIONS.includes(extensionOf(name))
}

function pad(value: string | number, length: number) {
  return String(value).padStart(length, '0')
}

export function episodeGroupKey(filePath: string): string {
  const directory = dirname(filePath).replaceAll('\\', '/').toLowerCase()
  const stem = basename(filePath).replace(/\.[^.]+$/, '')
  const seasonEpisode = stem.match(/(?:^|[\s._-])S(\d{1,2})[\s._-]*E(\d{1,3})(?:[\s._-]|$)/i)
  if (seasonEpisode) {
    return `${directory}::s${pad(seasonEpisode[1]!, 2)}e${pad(seasonEpisode[2]!, 3)}`
  }
  const episodeOnly = stem.match(/(?:^|[\s._-])(?:EP|E)(\d{1,4})(?:[\s._-]|$)/i)
  if (episodeOnly) return `${directory}::e${pad(episodeOnly[1]!, 4)}`
  const chineseEpisode = stem.match(/第\s*(\d{1,4})\s*[集话話]/)
  if (chineseEpisode) return `${directory}::e${pad(chineseEpisode[1]!, 4)}`
  return ''
}

function extensionPriority(filePath: string) {
  const ext = extensionOf(filePath)
  const index = VIDEO_EXTENSIONS.indexOf(ext)
  return index === -1 ? VIDEO_EXTENSIONS.length : index
}

async function resolveEntrySize(entry: BatchFileEntry) {
  try {
    const absolute = await resolveMediaPath(entry.path, entry.rootId)
    return (await stat(absolute)).size
  } catch {
    return 0
  }
}

export async function dedupeBatchEntries<T extends BatchFileEntry>(
  entries: T[],
  sizeResolver: (entry: T) => Promise<number> = resolveEntrySize
) {
  const unique: T[] = []
  const seen = new Set<string>()
  for (const entry of entries) {
    const key = `${entry.rootId || ''}:${entry.path}`
    if (seen.has(key)) continue
    seen.add(key)
    unique.push(entry)
  }

  const kept: T[] = []
  const skipped: T[] = []
  const duplicateGroups = new Map<string, T[]>()

  for (const entry of unique) {
    if (!isVideoFile(entry.path)) {
      kept.push(entry)
      continue
    }
    const key = episodeGroupKey(entry.path)
    if (!key) {
      kept.push(entry)
      continue
    }
    const groupKey = `${entry.rootId || ''}::${key}`
    const group = duplicateGroups.get(groupKey) || []
    group.push(entry)
    duplicateGroups.set(groupKey, group)
  }

  let duplicateGroupCount = 0
  for (const group of duplicateGroups.values()) {
    if (group.length === 1) {
      kept.push(group[0]!)
      continue
    }
    duplicateGroupCount += 1
    const scored = await Promise.all(group.map(async (entry) => ({
      entry,
      size: await sizeResolver(entry)
    })))
    scored.sort((a, b) => (
      b.size - a.size
      || extensionPriority(a.entry.path) - extensionPriority(b.entry.path)
      || a.entry.path.localeCompare(b.entry.path, 'zh-CN')
    ))
    kept.push(scored[0]!.entry)
    skipped.push(...scored.slice(1).map(item => item.entry))
  }

  return { files: kept, skipped, duplicateGroups: duplicateGroupCount }
}

export async function scanMediaFolder(rootId: string, folderPath = '') {
  const root = await getMediaRoot(rootId)
  const rootAbsolute = normalize(resolve(root.path))
  const startAbsolute = await resolveInsideRoot(rootAbsolute, folderPath || '.', { allowMissing: false })
  const normalizedFolder = folderPath.replaceAll('\\', '/').replace(/^\/+|\/+$/g, '')
  const files: ScannedFile[] = []
  let truncated = false

  const walk = async (absoluteDir: string, depth: number) => {
    if (truncated || depth > MAX_SCAN_DEPTH) return
    let entries
    try {
      entries = await readdir(absoluteDir, { withFileTypes: true })
    } catch (e: any) {
      throw createError({
        statusCode: 500,
        message: `目录扫描失败: ${relative(rootAbsolute, absoluteDir) || '/'} (${e?.code || 'UNKNOWN'})`
      })
    }

    for (const entry of entries) {
      if (truncated) return
      if (entry.name.startsWith('.') || entry.isSymbolicLink()) continue
      const absolutePath = join(absoluteDir, entry.name)
      let info
      try {
        info = await lstat(absolutePath)
      } catch {
        continue
      }
      if (info.isSymbolicLink()) continue
      if (info.isDirectory()) {
        await walk(absolutePath, depth + 1)
        continue
      }
      if (!isVideoFile(entry.name)) continue
      const relPath = relative(rootAbsolute, absolutePath).replaceAll('\\', '/')
      files.push({
        name: entry.name,
        path: relPath,
        isDir: false,
        rootId: root.id,
        rootName: root.name,
        size: info.size
      })
      if (files.length >= MAX_SCAN_FILES) {
        truncated = true
        return
      }
    }
  }

  await walk(startAbsolute, 0)
  files.sort((a, b) => a.path.localeCompare(b.path, 'zh-CN'))
  return {
    rootId: root.id,
    rootName: root.name,
    path: normalizedFolder,
    files,
    total: files.length,
    truncated
  }
}


export async function searchMediaFiles(rootId: string, query: string, limit = 200, signal?: AbortSignal) {
  const keyword = String(query || '').trim().toLowerCase()
  if (keyword.length < 2) {
    return { rootId, query: keyword, files: [] as ScannedFile[], total: 0, truncated: false, aborted: false }
  }
  let aborted = signal?.aborted === true
  if (aborted) {
    return { rootId, query: keyword, files: [] as ScannedFile[], total: 0, truncated: false, aborted: true }
  }
  const root = await getMediaRoot(rootId)
  const rootAbsolute = normalize(resolve(root.path))
  const startAbsolute = await resolveInsideRoot(rootAbsolute, '.', { allowMissing: false })
  const maxResults = Math.min(500, Math.max(1, Number(limit) || 200))
  const files: ScannedFile[] = []
  let scanned = 0
  let truncated = false

  const walk = async (absoluteDir: string, depth: number) => {
    if (signal?.aborted) {
      aborted = true
      return
    }
    if (truncated || depth > MAX_SCAN_DEPTH) return
    let entries
    try {
      entries = await readdir(absoluteDir, { withFileTypes: true })
    } catch {
      return
    }
    if (signal?.aborted) {
      aborted = true
      return
    }

    for (const entry of entries) {
      if (signal?.aborted) {
        aborted = true
        return
      }
      if (truncated) return
      if (entry.name.startsWith('.') || entry.isSymbolicLink()) continue
      const absolutePath = join(absoluteDir, entry.name)
      let info
      try {
        info = await lstat(absolutePath)
      } catch {
        continue
      }
      if (signal?.aborted) {
        aborted = true
        return
      }
      if (info.isSymbolicLink()) continue
      if (info.isDirectory()) {
        await walk(absolutePath, depth + 1)
        if (aborted) return
        continue
      }
      if (!isVideoFile(entry.name) && !isSubtitleFile(entry.name)) continue
      scanned += 1
      if (scanned > MAX_SEARCH_ENTRIES) {
        truncated = true
        return
      }
      const relPath = relative(rootAbsolute, absolutePath).replaceAll('\\', '/')
      const haystack = `${entry.name} ${relPath}`.toLowerCase()
      if (!haystack.includes(keyword)) continue
      files.push({
        name: entry.name,
        path: relPath,
        isDir: false,
        rootId: root.id,
        rootName: root.name,
        size: info.size
      })
      if (files.length >= maxResults) {
        truncated = true
        return
      }
    }
  }

  await walk(startAbsolute, 0)
  files.sort((a, b) => a.path.localeCompare(b.path, 'zh-CN'))
  return { rootId: root.id, rootName: root.name, query: keyword, files, total: files.length, truncated, aborted }
}
