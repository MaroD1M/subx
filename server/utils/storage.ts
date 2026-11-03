/**
 * Storage and cache inspection.
 *
 * Only SubX-owned temp/cache directories are listed or cleaned. Model files are
 * shown for context but are never deleted here; media directories are excluded
 * entirely. Destructive actions are additionally age-gated to avoid touching
 * files used by an active task.
 */

import { existsSync } from 'fs'
import { lstat, readdir, rm, statfs, unlink } from 'fs/promises'
import { join, resolve } from 'path'
import { tmpdir } from 'os'
import { useDb } from './db'
import { isPathInside } from './pathSafety'
import { isAudioInUse } from './asr/audioCache'
import { getActiveTaskIds } from './activeTasks'
import { ConfigService } from './config'

export type StorageTarget =
  | 'asrAudio'
  | 'aiLogs'
  | 'taskTemp'
  | 'taskLogs'
  | 'ocrTemp'
  | 'translationCache'

export interface StorageCategory {
  key: StorageTarget | 'models' | 'disk'
  label: string
  description: string
  bytes: number
  files: number
  cleanable: boolean
  defaultDays: number
  path?: string
}

export interface StorageSummary {
  disk: {
    totalBytes: number
    freeBytes: number
    usedBytes: number
    usedPercent: number
  }
  cacheBytes: number
  cacheFiles: number
  categories: StorageCategory[]
}

export interface StorageCleanupResult {
  deletedBytes: number
  deletedFiles: number
  categories: string[]
  errors: string[]
}

const TEMP_ROOT = join(process.cwd(), 'temp')
const ASR_AUDIO_DIR = join(TEMP_ROOT, 'asr-audio')
const AI_LOGS_DIR = join(TEMP_ROOT, 'ai-logs')
const TASK_LOG_DIR = join(process.cwd(), 'db', 'logs')
const MODEL_DIR = process.env.ASR_MODEL_DIR || '/models'
const OCR_TEMP_DIR = resolve(process.env.OCR_TEMP_DIR || join(TEMP_ROOT, 'ocr'))
const OCR_TEMP_PREFIXES = ['subx-ocr-', 'subx-preprocess-']
const TEMP_FILE_PATTERN = /^(?:download_orig_|clip_)|\.(?:partial|srt|mp3|wav)$/i
const MIN_SAFE_AGE_MS = 5 * 60 * 1000

async function ocrSafeAgeMs() {
  const fallbackMax = Number(process.env.OCR_MAX_SECONDS || 14400)
  const fallbackAbsolute = Number(process.env.OCR_JOB_ABSOLUTE_TIMEOUT_MS || 6 * 60 * 60 * 1000)
  try {
    const config = await ConfigService.getConfig()
    const maxSeconds = Number(config.ocrMaxSeconds || fallbackMax)
    const absoluteMs = Number(config.ocrJobAbsoluteTimeoutMs || fallbackAbsolute)
    const resumeMs = Number(config.ocrResumeTtlHours || 24) * 60 * 60 * 1000
    return Math.max(60 * 60 * 1000, Math.max(maxSeconds * 1000, absoluteMs, resumeMs) + 30 * 60 * 1000)
  } catch {
    const resumeMs = Number(process.env.OCR_RESUME_TTL_HOURS || 24) * 60 * 60 * 1000
    return Math.max(60 * 60 * 1000, Math.max(fallbackMax * 1000, fallbackAbsolute, resumeMs) + 30 * 60 * 1000)
  }
}

function belongsToActiveTask(name: string): boolean {
  return getActiveTaskIds().some(taskId => name.includes(taskId))
}

function asrAudioDefaultDays() {
  const value = Number(process.env.ASR_AUDIO_CACHE_DAYS || 14)
  return Number.isFinite(value) ? Math.max(1, Math.min(3650, Math.floor(value))) : 14
}

async function scanFiles(dir: string, options: { recursive?: boolean, match?: (name: string) => boolean } = {}) {
  let bytes = 0
  let files = 0
  const paths: string[] = []
  const recursive = options.recursive !== false

  const walk = async (current: string, depth: number) => {
    if (depth > 16) return
    const entries = await readdir(current, { withFileTypes: true }).catch(() => [])
    for (const entry of entries) {
      const full = join(current, entry.name)
      if (entry.isSymbolicLink()) continue
      if (entry.isDirectory()) {
        if (recursive) await walk(full, depth + 1)
        continue
      }
      if (!entry.isFile()) continue
      if (options.match && !options.match(entry.name)) continue
      try {
        const info = await lstat(full)
        bytes += info.size
        files += 1
        paths.push(full)
      } catch { /* ignore unreadable entries */ }
    }
  }

  await walk(dir, 0)
  return { bytes, files, paths }
}

function ocrTempRoots(): string[] {
  const roots = [OCR_TEMP_DIR]
  const legacy = tmpdir()
  if (resolve(legacy) !== resolve(OCR_TEMP_DIR)) roots.push(legacy)
  return roots
}

async function scanOcrTemp() {
  let bytes = 0
  let files = 0
  const paths: string[] = []
  for (const root of ocrTempRoots()) {
    const entries = await readdir(root, { withFileTypes: true }).catch(() => [])
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      if (!OCR_TEMP_PREFIXES.some(prefix => entry.name.startsWith(prefix))) continue
      const full = join(root, entry.name)
      if (!isPathInside(root, full)) continue
      const scanned = await scanFiles(full)
      bytes += scanned.bytes
      files += scanned.files
      paths.push(full)
    }
  }
  return { bytes, files, paths }
}

function translationCacheStats() {
  try {
    const row = useDb().prepare(`
      SELECT COUNT(*) AS count, COALESCE(SUM(length(original_text) + length(translated_text)), 0) AS bytes
      FROM translations_cache
    `).get() as { count?: number, bytes?: number } | undefined
    return {
      files: Number(row?.count || 0),
      bytes: Number(row?.bytes || 0)
    }
  } catch {
    return { files: 0, bytes: 0 }
  }
}

async function diskStats() {
  try {
    const stats = await statfs(process.cwd())
    const totalBytes = Number(stats.blocks) * Number(stats.bsize)
    const freeBytes = Number(stats.bavail) * Number(stats.bsize)
    const usedBytes = Math.max(0, totalBytes - freeBytes)
    return {
      totalBytes,
      freeBytes,
      usedBytes,
      usedPercent: totalBytes > 0 ? Math.round((usedBytes / totalBytes) * 100) : 0
    }
  } catch {
    return { totalBytes: 0, freeBytes: 0, usedBytes: 0, usedPercent: 0 }
  }
}

function category(key: StorageCategory['key'], label: string, description: string, data: { bytes: number, files: number }, path: string, cleanable = true, defaultDays = 7): StorageCategory {
  return { key, label, description, bytes: data.bytes, files: data.files, path, cleanable, defaultDays }
}

export const StorageService = {
  async summary(): Promise<StorageSummary> {
    const [asrAudio, aiLogs, taskTemp, taskLogs, ocrTemp, models, disk] = await Promise.all([
      scanFiles(ASR_AUDIO_DIR),
      scanFiles(AI_LOGS_DIR),
      scanFiles(TEMP_ROOT, { recursive: false, match: name => TEMP_FILE_PATTERN.test(name) }),
      scanFiles(TASK_LOG_DIR, { recursive: false, match: name => name.startsWith('task_') && name.endsWith('.log') }),
      scanOcrTemp(),
      existsSync(MODEL_DIR) ? scanFiles(MODEL_DIR) : Promise.resolve({ bytes: 0, files: 0, paths: [] }),
      diskStats()
    ])
    const translationCache = translationCacheStats()
    const categories: StorageCategory[] = [
      category('asrAudio', 'ASR 音频缓存', '语音识别提取的 WAV，失败重试会复用。', asrAudio, ASR_AUDIO_DIR, true, asrAudioDefaultDays()),
      category('ocrTemp', 'OCR 临时图像', 'OCR 抽帧临时目录，默认位于 temp/ocr；兼容清理旧 /tmp 残留。', ocrTemp, OCR_TEMP_DIR, true, 1),
      category('taskTemp', '任务临时文件', '字幕临时文件、音频片段、分块 partial 等。', taskTemp, TEMP_ROOT),
      category('aiLogs', 'AI 请求日志', '每次翻译请求的请求/响应调试日志。', aiLogs, AI_LOGS_DIR),
      category('taskLogs', '任务日志文件', 'db/logs 下的任务文本日志。', taskLogs, TASK_LOG_DIR),
      category('translationCache', '翻译缓存', 'SQLite/PostgreSQL 中可复用的翻译结果。', translationCache, '数据库', true, 30),
      category('models', '本地模型', 'Whisper 等模型文件，不通过缓存清理删除。', models, MODEL_DIR, false)
    ]

    const cacheCategories = categories.filter(item => item.key !== 'models')
    return {
      disk,
      cacheBytes: cacheCategories.reduce((sum, item) => sum + item.bytes, 0),
      cacheFiles: cacheCategories.reduce((sum, item) => sum + item.files, 0),
      categories
    }
  },

  async cleanup(targets: StorageTarget[], options: { days?: number, all?: boolean } = {}): Promise<StorageCleanupResult> {
    const allowed = new Set<StorageTarget>(['asrAudio', 'aiLogs', 'taskTemp', 'taskLogs', 'ocrTemp', 'translationCache'])
    const selected = Array.from(new Set(targets)).filter((target): target is StorageTarget => allowed.has(target as StorageTarget))
    const result: StorageCleanupResult = { deletedBytes: 0, deletedFiles: 0, categories: [], errors: [] }
    if (!selected.length) return result

    const all = options.all === true
    const days = Number.isFinite(Number(options.days)) ? Math.max(1, Math.min(3650, Math.floor(Number(options.days)))) : 0
    const dayMs = 24 * 60 * 60 * 1000
    const categoryDays: Record<StorageTarget, number> = {
      asrAudio: asrAudioDefaultDays(),
      ocrTemp: 1,
      taskTemp: 7,
      aiLogs: 7,
      taskLogs: 7,
      translationCache: 30
    }
    const ocrSafeAge = selected.includes('ocrTemp') ? await ocrSafeAgeMs() : 0
    const cutoffFor = (target: StorageTarget) => all
      ? Date.now() - (target === 'ocrTemp' ? ocrSafeAge : MIN_SAFE_AGE_MS)
      : Date.now() - (days || categoryDays[target]) * dayMs

    const removeFile = async (file: string, allowedRoot: string, cutoff: number) => {
      if (!isPathInside(allowedRoot, file)) throw new Error('拒绝清理越权路径')
      const info = await lstat(file).catch(() => null)
      if (!info || info.isSymbolicLink() || !info.isFile()) return
      if (info.mtimeMs > cutoff) return
      await unlink(file)
      result.deletedFiles += 1
      result.deletedBytes += info.size
    }

    const cleanDirectoryFiles = async (dir: string, target: StorageTarget, match?: (name: string) => boolean) => {
      const cutoff = cutoffFor(target)
      const entries = await readdir(dir, { withFileTypes: true }).catch(() => [])
      for (const entry of entries) {
        if (!entry.isFile() || entry.isSymbolicLink()) continue
        if (match && !match(entry.name)) continue
        try {
          await removeFile(join(dir, entry.name), dir, cutoff)
        } catch (error: any) {
          result.errors.push(`${entry.name}: ${error?.message || error}`)
        }
      }
    }

    for (const target of selected) {
      result.categories.push(target)
      try {
        if (target === 'asrAudio') {
          await cleanDirectoryFiles(ASR_AUDIO_DIR, 'asrAudio', name => !isAudioInUse(join(ASR_AUDIO_DIR, name)))
        } else if (target === 'aiLogs') {
          await cleanDirectoryFiles(AI_LOGS_DIR, 'aiLogs')
        } else if (target === 'taskTemp') {
          await cleanDirectoryFiles(TEMP_ROOT, 'taskTemp', name => TEMP_FILE_PATTERN.test(name) && !belongsToActiveTask(name))
        } else if (target === 'taskLogs') {
          await cleanDirectoryFiles(TASK_LOG_DIR, 'taskLogs', name => name.startsWith('task_') && name.endsWith('.log') && !belongsToActiveTask(name))
        } else if (target === 'ocrTemp') {
          for (const root of ocrTempRoots()) {
            const entries = await readdir(root, { withFileTypes: true }).catch(() => [])
            for (const entry of entries) {
              if (!entry.isDirectory()) continue
              if (!OCR_TEMP_PREFIXES.some(prefix => entry.name.startsWith(prefix))) continue
              const full = join(root, entry.name)
              if (!isPathInside(root, full)) continue
              const info = await lstat(full).catch(() => null)
              if (!info || info.isSymbolicLink() || !info.isDirectory()) continue
              if (info.mtimeMs > cutoffFor('ocrTemp')) continue
              const scanned = await scanFiles(full)
              await rm(full, { recursive: true, force: true })
              result.deletedFiles += scanned.files
              result.deletedBytes += scanned.bytes
            }
          }
        } else if (target === 'translationCache') {
          const db = useDb()
          if (all) {
            const row = db.prepare('SELECT COUNT(*) AS count FROM translations_cache').get() as { count?: number } | undefined
            const bytes = translationCacheStats().bytes
            db.prepare('DELETE FROM translations_cache').run()
            result.deletedFiles += Number(row?.count || 0)
            result.deletedBytes += bytes
          } else {
            const daysValue = days || categoryDays.translationCache
            const row = db.prepare(`
              SELECT COUNT(*) AS count, COALESCE(SUM(length(original_text) + length(translated_text)), 0) AS bytes
              FROM translations_cache WHERE updated_at < datetime('now', ?)
            `).get(`-${daysValue} days`) as { count?: number, bytes?: number } | undefined
            db.prepare('DELETE FROM translations_cache WHERE updated_at < datetime(\'now\', ?)').run(`-${daysValue} days`)
            result.deletedFiles += Number(row?.count || 0)
            result.deletedBytes += Number(row?.bytes || 0)
          }
        }
      } catch (error: any) {
        result.errors.push(`${target}: ${error?.message || error}`)
      }
    }

    return result
  }
}
