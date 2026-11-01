import { createHash } from 'crypto'
import { basename, extname } from 'path'
import type { WatchOutputPolicy, WatchRules } from '../../types'

export const DEFAULT_VIDEO_EXTENSIONS = [
  '.mkv', '.mp4', '.avi', '.webm', '.ts', '.m2ts', '.mts', '.mov',
  '.wmv', '.flv', '.mpg', '.mpeg', '.m4v', '.3gp'
]

export const DEFAULT_SUBTITLE_EXTENSIONS = ['.srt', '.ass', '.ssa', '.vtt', '.sub']

export const DEFAULT_WATCH_RULES: WatchRules = {
  extensions: [...DEFAULT_VIDEO_EXTENSIONS],
  includeRegex: '',
  excludeRegex: '',
  minSizeMb: 0,
  maxSizeMb: 0,
  minDurationSec: 0,
  createdAfter: '',
  createdBefore: '',
  modifiedAfter: '',
  modifiedBefore: '',
  stableSeconds: 15,
  skipExistingSubtitles: true,
  skipExistingOutput: true
}

export const DEFAULT_WATCH_OUTPUT_POLICY: WatchOutputPolicy = {
  targetLanguage: '',
  outputMode: 'translated',
  stylePreset: 'default',
  subtitleFormat: 'srt',
  subtitleStylePreset: 'bilingual_simple',
  bilingualLayout: 'translated_first',
  sourceType: 'auto',
  model: '',
  notifyChannelIds: []
}

function normalizeExtension(value: unknown): string {
  const ext = String(value || '').trim().toLowerCase()
  if (!ext) return ''
  return ext.startsWith('.') ? ext : `.${ext}`
}

function normalizeNumber(value: unknown, fallback = 0, min = 0, max = Number.MAX_SAFE_INTEGER): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(max, Math.max(min, parsed))
}

function normalizeDate(value: unknown): string {
  const text = String(value || '').trim()
  if (!text) return ''
  const time = Date.parse(text)
  return Number.isFinite(time) ? text : ''
}

function validateRegex(value: unknown, label: string): string {
  const pattern = String(value || '').trim()
  if (!pattern) return ''
  try {
    new RegExp(pattern)
  } catch {
    throw new Error(`${label}不是合法的正则表达式`)
  }
  return pattern
}

export function sanitizeWatchRules(input: unknown): WatchRules {
  const raw = (input && typeof input === 'object') ? input as Record<string, any> : {}
  const extensions = Array.isArray(raw.extensions)
    ? raw.extensions.map(normalizeExtension).filter(Boolean)
    : [...DEFAULT_VIDEO_EXTENSIONS]

  return {
    extensions: Array.from(new Set(extensions.length ? extensions : DEFAULT_VIDEO_EXTENSIONS)),
    includeRegex: validateRegex(raw.includeRegex, '包含正则'),
    excludeRegex: validateRegex(raw.excludeRegex, '排除正则'),
    minSizeMb: normalizeNumber(raw.minSizeMb, 0, 0, 1024 * 1024),
    maxSizeMb: normalizeNumber(raw.maxSizeMb, 0, 0, 1024 * 1024),
    minDurationSec: normalizeNumber(raw.minDurationSec, 0, 0, 7 * 24 * 60 * 60),
    createdAfter: normalizeDate(raw.createdAfter),
    createdBefore: normalizeDate(raw.createdBefore),
    modifiedAfter: normalizeDate(raw.modifiedAfter),
    modifiedBefore: normalizeDate(raw.modifiedBefore),
    stableSeconds: normalizeNumber(raw.stableSeconds, DEFAULT_WATCH_RULES.stableSeconds, 0, 24 * 60 * 60),
    skipExistingSubtitles: raw.skipExistingSubtitles !== false,
    skipExistingOutput: raw.skipExistingOutput !== false
  }
}

export function sanitizeOutputPolicy(input: unknown): WatchOutputPolicy {
  const raw = (input && typeof input === 'object') ? input as Record<string, any> : {}
  const outputMode = ['translated', 'bilingual', 'original'].includes(String(raw.outputMode))
    ? String(raw.outputMode) as WatchOutputPolicy['outputMode']
    : DEFAULT_WATCH_OUTPUT_POLICY.outputMode
  const subtitleFormat = ['srt', 'ass', 'both'].includes(String(raw.subtitleFormat))
    ? String(raw.subtitleFormat) as WatchOutputPolicy['subtitleFormat']
    : DEFAULT_WATCH_OUTPUT_POLICY.subtitleFormat
  const bilingualLayout = ['translated_first', 'original_first'].includes(String(raw.bilingualLayout))
    ? String(raw.bilingualLayout) as WatchOutputPolicy['bilingualLayout']
    : DEFAULT_WATCH_OUTPUT_POLICY.bilingualLayout
  const sourceType = ['auto', 'embedded', 'external', 'asr', 'ocr'].includes(String(raw.sourceType))
    ? String(raw.sourceType) as WatchOutputPolicy['sourceType']
    : DEFAULT_WATCH_OUTPUT_POLICY.sourceType

  return {
    targetLanguage: String(raw.targetLanguage || '').trim(),
    outputMode,
    stylePreset: String(raw.stylePreset || 'default').trim() || 'default',
    subtitleFormat,
    subtitleStylePreset: String(raw.subtitleStylePreset || 'bilingual_simple').trim() || 'bilingual_simple',
    bilingualLayout,
    sourceType,
    model: String(raw.model || '').trim(),
    notifyChannelIds: Array.isArray(raw.notifyChannelIds)
      ? Array.from(new Set(raw.notifyChannelIds.map((id: any) => Number(id)).filter((id: number) => Number.isInteger(id) && id > 0)))
      : []
  }
}

export function normalizeRelativePath(value: string): string {
  return String(value || '').replaceAll('\\', '/').replace(/^\.\//, '').replace(/\/+/g, '/').replace(/^\/+/, '')
}

export function isIgnoredRelativePath(relativePath: string): boolean {
  const normalized = normalizeRelativePath(relativePath)
  if (!normalized) return true
  const segments = normalized.split('/')
  if (segments.some(segment => !segment || segment.startsWith('.') || segment === 'SubX' || segment === '@eaDir' || segment === '#recycle')) {
    return true
  }
  const lower = normalized.toLowerCase()
  return /\.(part|tmp|download|!qb|aria2|crdownload)$/i.test(lower)
}

function isSubtitleName(name: string): boolean {
  return DEFAULT_SUBTITLE_EXTENSIONS.includes(extname(name).toLowerCase())
}

export function buildDedupeKey(relativePath: string, size: number, mtimeMs: number): string {
  return createHash('sha256')
    .update(`${normalizeRelativePath(relativePath)}|${Number(size) || 0}|${Math.floor(Number(mtimeMs) || 0)}`)
    .digest('hex')
}

function parseTime(value: string): number | null {
  if (!value) return null
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : null
}

export interface WatchCandidateInput {
  relativePath: string
  size: number
  mtimeMs: number
  createdMs: number
  now?: number
  siblingNames?: string[]
  rules: WatchRules
  policy: WatchOutputPolicy
}

export interface WatchCandidateResult {
  accepted: boolean
  reason?: string
  dedupeKey: string
}

export function evaluateWatchCandidate(input: WatchCandidateInput): WatchCandidateResult {
  const relativePath = normalizeRelativePath(input.relativePath)
  const dedupeKey = buildDedupeKey(relativePath, input.size, input.mtimeMs)
  const reject = (reason: string): WatchCandidateResult => ({ accepted: false, reason, dedupeKey })
  const rules = input.rules
  const name = basename(relativePath)
  const ext = extname(name).toLowerCase()
  const base = name.slice(0, name.length - ext.length)

  if (!relativePath || isIgnoredRelativePath(relativePath)) return reject('忽略的路径或临时文件')
  if (!rules.extensions.includes(ext)) return reject('扩展名不在监控范围')

  const now = Number(input.now ?? Date.now())
  const stableMs = Math.max(0, Number(rules.stableSeconds || 0)) * 1000
  if (stableMs > 0 && now - Number(input.mtimeMs || 0) < stableMs) return reject('文件尚未稳定')

  const sizeMb = Number(input.size || 0) / 1024 / 1024
  if (rules.minSizeMb > 0 && sizeMb < rules.minSizeMb) return reject('文件小于最小体积')
  if (rules.maxSizeMb > 0 && sizeMb > rules.maxSizeMb) return reject('文件大于最大体积')

  const checks = [
    [rules.createdAfter, input.createdMs, 'createdAfter', '创建时间早于起始范围'],
    [rules.createdBefore, input.createdMs, 'createdBefore', '创建时间晚于结束范围'],
    [rules.modifiedAfter, input.mtimeMs, 'modifiedAfter', '修改时间早于起始范围'],
    [rules.modifiedBefore, input.mtimeMs, 'modifiedBefore', '修改时间晚于结束范围']
  ] as const
  for (const [raw, value, , message] of checks) {
    const boundary = parseTime(raw)
    if (boundary === null) continue
    if ((raw === rules.createdAfter || raw === rules.modifiedAfter) && value < boundary) return reject(message)
    if ((raw === rules.createdBefore || raw === rules.modifiedBefore) && value > boundary) return reject(message)
  }

  if (rules.includeRegex && !new RegExp(rules.includeRegex).test(relativePath)) return reject('不匹配包含规则')
  if (rules.excludeRegex && new RegExp(rules.excludeRegex).test(relativePath)) return reject('匹配排除规则')

  const siblings = Array.isArray(input.siblingNames) ? input.siblingNames : []
  if (rules.skipExistingOutput) {
    const outputExt = input.policy.subtitleFormat === 'both' ? 'ass' : input.policy.subtitleFormat
    const suffix = input.policy.outputMode === 'original'
      ? 'original'
      : (input.policy.targetLanguage || 'zh-CN')
    const expected = `${base}.${suffix}.${outputExt}`
    if (siblings.includes(expected) || siblings.includes(`SubX/${expected}`)) return reject('已存在目标输出字幕')
  }

  if (rules.skipExistingSubtitles) {
    const hasSubtitle = siblings.some(sibling => {
      if (sibling === name || !isSubtitleName(sibling)) return false
      return sibling.startsWith(`${base}.`)
    })
    if (hasSubtitle) return reject('已存在同名字幕')
  }

  return { accepted: true, dedupeKey }
}
