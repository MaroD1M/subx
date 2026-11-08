import type { SubtitleEntry } from '../../types'
import { useDb } from './db'
import { logger } from './logger'
import { SubtitleService } from './subtitle'

export type ChunkRiskProfile = {
  tags: string[]
  stylePromptSuffix?: string
}

export type ChunkDiagnostics = {
  chunkIndex: number
  initialSize: number
  retryAttempts: number
  validationFailures: number
  singleRetryAttempts: number
  singleRetrySuccesses: number
  singleRetryFailures: number
  fallbackCount: number
  missingIds: string[]
  contaminatedIds: string[]
  reviewIds: string[]
  finalStatus: 'ok' | 'partial' | 'fallback' | 'review'
}

export function expandRetryEntries(entries: SubtitleEntry[], targetIds: string[]) {
  if (!targetIds.length) return entries

  const idSet = new Set(targetIds.map(id => String(id)))
  const expandedIds = new Set<string>()
  const targetIndexes: number[] = []

  entries.forEach((entry, index) => {
    const currentId = String(entry.id)
    if (!idSet.has(currentId)) return

    targetIndexes.push(index)

    expandedIds.add(currentId)
    if (index > 0) expandedIds.add(String(entries[index - 1]!.id))
    if (index + 1 < entries.length) expandedIds.add(String(entries[index + 1]!.id))
  })

  if (targetIndexes.length >= 2) {
    const minIndex = Math.max(0, Math.min(...targetIndexes) - 1)
    const maxIndex = Math.min(entries.length - 1, Math.max(...targetIndexes) + 1)

    for (let index = minIndex; index <= maxIndex; index++) {
      expandedIds.add(String(entries[index]!.id))
    }
  }

  return entries.filter(entry => expandedIds.has(String(entry.id)))
}

function mapReviewStatus(entry: SubtitleEntry, issuesById: Map<string, Array<{ reason: string, severity?: 'soft' | 'hard' }>>) {
  const issueList = issuesById.get(String(entry.id)) || []
  const reviewReasons = issueList.map(issue => issue.reason)
  const lowAsrConfidence = entry.asrConfidence !== undefined && Number(entry.asrConfidence) > 0 && Number(entry.asrConfidence) < 0.6
  if (lowAsrConfidence && !reviewReasons.includes('low_asr_confidence')) {
    reviewReasons.push('low_asr_confidence')
  }
  const translated = String(entry.translatedText || '')
  const original = String(entry.text || '')
  const normalizedTranslated = SubtitleService.normalizeComparisonText(translated)
  const normalizedOriginal = SubtitleService.normalizeComparisonText(original)

  if (!normalizedTranslated) {
    return { reviewStatus: 'missing', reviewReasons }
  }
  if (issueList.some(issue => issue.reason === 'same_as_source')) {
    return { reviewStatus: 'fallback_original', reviewReasons }
  }
  if (normalizedOriginal && normalizedOriginal === normalizedTranslated) {
    return { reviewStatus: 'accepted_same', reviewReasons }
  }
  if (issueList.length > 0 || lowAsrConfidence) {
    return { reviewStatus: 'needs_review', reviewReasons }
  }
  return { reviewStatus: 'translated', reviewReasons }
}

export function persistReviewEntries(taskId: string, entries: SubtitleEntry[], issues: Array<{ id: string, reason: string, severity?: 'soft' | 'hard' }>) {
  const db = useDb()
  const issueMap = new Map<string, Array<{ reason: string, severity?: 'soft' | 'hard' }>>()
  for (const issue of issues) {
    const list = issueMap.get(String(issue.id)) || []
    list.push(issue)
    issueMap.set(String(issue.id), list)
  }

  db.exec('BEGIN')
  try {
    const stmt = db.prepare(`
      INSERT INTO task_review_entries (
        task_id, subtitle_id, start_time, end_time, original_text, translated_text, final_text, review_status, review_reasons, asr_confidence, quality_score, quality_issues, sort_order, selected, edited, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, datetime('now'), datetime('now'))
      ON CONFLICT(task_id, subtitle_id) DO UPDATE SET
        start_time=excluded.start_time,
        end_time=excluded.end_time,
        original_text=excluded.original_text,
        translated_text=excluded.translated_text,
        final_text=excluded.final_text,
        review_status=excluded.review_status,
        review_reasons=excluded.review_reasons,
        asr_confidence=excluded.asr_confidence,
        quality_score=excluded.quality_score,
        quality_issues=excluded.quality_issues,
        sort_order=excluded.sort_order,
        updated_at=datetime('now')
    `)

    entries.forEach((entry, index) => {
      const review = mapReviewStatus(entry, issueMap)
      stmt.run(
        taskId,
        String(entry.id),
        String(entry.startTime || ''),
        String(entry.endTime || ''),
        String(entry.text || ''),
        String(entry.translatedText || ''),
        String(entry.translatedText || entry.text || ''),
        review.reviewStatus,
        JSON.stringify(review.reviewReasons || []),
        entry.asrConfidence ?? null,
        entry.qualityScore ?? null,
        JSON.stringify(entry.qualityIssues || []),
        index
      )
    })
    db.exec('COMMIT')
  } catch (error) {
    try { db.exec('ROLLBACK') } catch { /* ignore rollback failure */ }
    throw error
  }
}

export function analyzeChunkRisk(entries: SubtitleEntry[]): ChunkRiskProfile {
  const tags = new Set<string>()

  for (const entry of entries) {
    const text = String(entry.text || '')
    const normalized = SubtitleService.normalizeSubtitleText(text)
    const lines = normalized.split('\n').map(line => line.trim()).filter(Boolean)

    if (SubtitleService.isLikelySongLyric(text)) {
      tags.add('lyrics')
    }
    if (lines.length > 0 && lines.every(line => /^[\[(（【].*[\])）】]$/.test(line))) {
      tags.add('non_dialogue')
    }
    if (normalized.includes('__SUBX_FMT_')) {
      tags.add('formatting_tokens')
    }
    if (lines.length >= 2 && lines.some(line => /[\u4e00-\u9fff]/.test(line)) && lines.some(line => /[A-Za-z]/.test(line))) {
      tags.add('bilingual_source')
    }
    if (lines.length >= 3) {
      tags.add('multi_line_dialogue')
    }
    if (normalized.length >= 120) {
      tags.add('long_text')
    }
  }

  const styleHints: string[] = []
  if (tags.has('lyrics')) styleHints.push('当前块疑似歌词，请保留歌词节奏与换行，不要省略短句，不要把多行歌词合并成一行。')
  if (tags.has('non_dialogue')) styleHints.push('当前块包含环境音/旁白括号描述，请保留括号结构并进行简洁汉化。')
  if (tags.has('bilingual_source')) styleHints.push('当前块疑似已含双语源字幕，请只翻译原语言内容，避免重复拼接双语。')
  if (tags.has('formatting_tokens')) styleHints.push('当前块包含格式占位符，必须严格保留所有 __SUBX_FMT_n__ 占位符及顺序。')

  return {
    tags: Array.from(tags),
    stylePromptSuffix: styleHints.length ? styleHints.join('\n') : undefined
  }
}
