import type { SubtitleEntry } from '../../types'
import { SubtitleService } from './subtitle'

export interface SubtitleQualityOptions {
  maxCharsPerLine: number
  maxLines: number
  maxCps: number
  minDurationMs: number
  maxDurationMs: number
  gapMs: number
}

export interface SubtitleQualityIssue {
  id: string
  reason: string
  severity: 'soft' | 'hard'
  detail?: string
}

export interface SubtitleQualityResult {
  issues: SubtitleQualityIssue[]
  entries: SubtitleEntry[]
  counts: Record<string, number>
  autoFixed: number
}

export const DEFAULT_SUBTITLE_QUALITY_OPTIONS: SubtitleQualityOptions = {
  maxCharsPerLine: 20,
  maxLines: 2,
  maxCps: 20,
  minDurationMs: 700,
  maxDurationMs: 8000,
  gapMs: 80
}

function stripTags(value: string) {
  return String(value || '')
    .replace(/\{[^}]*\}/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/__SUBX_FMT_\d+__/g, '')
}

function readableUnits(value: string) {
  const text = stripTags(value)
  const cjk = (text.match(/[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\u3040-\u30ff\uac00-\ud7af]/g) || []).length
  const latin = (text.replace(/[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\u3040-\u30ff\uac00-\ud7af]/g, ' ').match(/[A-Za-z0-9]+(?:['’-][A-Za-z0-9]+)*/g) || []).length
  return cjk + latin
}

function displayLines(value: string) {
  return stripTags(value)
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
}

function wrapLine(line: string, maxChars: number) {
  const chars = Array.from(line)
  if (chars.length <= maxChars) return [line]
  const lines: string[] = []
  let current = ''
  for (const char of chars) {
    current += char
    if (Array.from(current).length < maxChars) continue
    const breakablePunctuation = /[\s，。！？、；：,.!?;:）】」』]$/.test(current)
    if (breakablePunctuation) {
      lines.push(current.trim())
      current = ''
      continue
    }
    const lastSpace = current.lastIndexOf(' ')
    if (lastSpace >= Math.floor(maxChars * 0.55)) {
      lines.push(current.slice(0, lastSpace).trim())
      current = current.slice(lastSpace + 1)
    } else {
      lines.push(current.trim())
      current = ''
    }
  }
  if (current.trim()) lines.push(current.trim())
  return lines.filter(Boolean)
}

function autoWrap(entry: SubtitleEntry, options: SubtitleQualityOptions) {
  const text = String(entry.translatedText || '')
  const sourceLines = text.split('\n').map(line => line.trim()).filter(Boolean)
  if (!sourceLines.length) return { entry, changed: false }
  const wrapped: string[] = []
  for (const line of sourceLines) wrapped.push(...wrapLine(line, options.maxCharsPerLine))
  if (wrapped.length > options.maxLines) return { entry, changed: false }
  const next = wrapped.join('\n')
  if (next === text) return { entry, changed: false }
  return { entry: { ...entry, translatedText: next }, changed: true }
}

export function analyzeSubtitleQuality(
  inputEntries: SubtitleEntry[],
  options: Partial<SubtitleQualityOptions> = {},
  autoFix = false
): SubtitleQualityResult {
  const settings = { ...DEFAULT_SUBTITLE_QUALITY_OPTIONS, ...options }
  const counts: Record<string, number> = {}
  const issues: SubtitleQualityIssue[] = []
  const entries: SubtitleEntry[] = []
  let autoFixed = 0

  let previousEndMs = -1

  for (const originalEntry of inputEntries) {
    const fixed = autoFix && String(originalEntry.translatedText || '').trim()
      ? autoWrap(originalEntry, settings)
      : { entry: originalEntry, changed: false }
    const entry = fixed.entry
    if (fixed.changed) autoFixed += 1
    entries.push(entry)

    const reasons = new Set<string>()
    const startMs = SubtitleService.srtTimeToMs(String(entry.startTime || ''))
    const endMs = SubtitleService.srtTimeToMs(String(entry.endTime || ''))
    const duration = Math.max(0, endMs - startMs)
    const translated = String(entry.translatedText || '')
    const lines = displayLines(translated)
    const normalized = stripTags(translated).trim()

    if (!normalized) {
      reasons.add('quality_empty')
    } else {
      if (lines.some(line => Array.from(line).length > settings.maxCharsPerLine)) reasons.add('line_too_long')
      if (lines.length > settings.maxLines) reasons.add('too_many_lines')
      if (duration > 0) {
        const cps = readableUnits(translated) / Math.max(0.2, duration / 1000)
        if (cps > settings.maxCps) reasons.add('cps_too_high')
      }
      if (duration > 0 && duration < settings.minDurationMs) reasons.add('duration_too_short')
      if (duration > settings.maxDurationMs) reasons.add('duration_too_long')
      if (previousEndMs >= 0) {
        const gap = startMs - previousEndMs
        if (startMs < previousEndMs) reasons.add('timing_overlap')
        else if (gap > 0 && gap < settings.gapMs) reasons.add('gap_too_small')
      }
      if (/\[[A-Za-z][^\]]{1,40}\]|\([A-Za-z][^)]{1,40}\)/.test(normalized)) {
        reasons.add('untranslated_sdh')
      }
    }

    for (const reason of reasons) {
      counts[reason] = (counts[reason] || 0) + 1
      issues.push({
        id: String(entry.id),
        reason,
        severity: ['quality_empty', 'timing_overlap'].includes(reason) ? 'hard' : 'soft',
        detail: reason === 'line_too_long'
          ? `最长 ${Math.max(...lines.map(line => Array.from(line).length), 0)} 字 / 上限 ${settings.maxCharsPerLine}`
          : reason === 'cps_too_high'
            ? `${(readableUnits(translated) / Math.max(0.2, duration / 1000)).toFixed(1)} CPS / 上限 ${settings.maxCps}`
            : undefined
      })
    }

    if (endMs >= startMs) {
      previousEndMs = endMs
    }
  }

  return { issues, entries, counts, autoFixed }
}
