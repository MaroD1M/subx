/**
 * Optional second-model translation quality review.
 *
 * Scores translated entries, persists a quality run and returns low-score
 * entries for the review UI. Quality review is best-effort: callers should log
 * failures and continue the main task without it.
 */

import type { SubtitleEntry } from '../../types'
import { useDb } from './db'
import { createProvider, normalizeProviderType } from './providers/registry'
import type { BoundTranslationProvider } from './providers/types'
import type { TranslationContext } from './translation'

export const QUALITY_ISSUES = [
  'omission',
  'addition',
  'mistranslation',
  'fluency',
  'terminology',
  'formatting',
  'name_inconsistency',
  'style_mismatch',
  'other'
] as const

export type QualityIssue = typeof QUALITY_ISSUES[number]

export interface QualityEntryResult {
  id: string
  score: number
  issues: QualityIssue[]
}

export interface QualityOptions {
  providerType: string
  apiKey: string
  baseUrl?: string
  model: string
  targetLanguage: string
  threshold: number
  maxEntries: number
  stylePrompt?: string
  context?: TranslationContext
}

function clampScore(value: unknown): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return 0
  return Math.min(1, Math.max(0, parsed))
}

function normalizeIssues(value: unknown): QualityIssue[] {
  const items = Array.isArray(value) ? value : []
  return Array.from(new Set(items
    .map(item => String(item || '').trim())
    .filter((item): item is QualityIssue => QUALITY_ISSUES.includes(item as QualityIssue))))
}

export function parseQualityResponse(raw: string, expectedIds: string[]): Map<string, QualityEntryResult> {
  const result = new Map<string, QualityEntryResult>()
  const text = String(raw || '').trim()
  if (!text) return result
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const candidate = fenced?.[1]?.trim() || text
  const start = candidate.indexOf('{')
  const end = candidate.lastIndexOf('}')
  if (start < 0 || end <= start) return result
  let parsed: any
  try {
    parsed = JSON.parse(candidate.slice(start, end + 1))
  } catch {
    return result
  }
  const items = Array.isArray(parsed?.items) ? parsed.items : []
  const expected = new Set(expectedIds.map(String))
  for (const item of items) {
    const id = String(item?.id ?? '').trim()
    if (!id || !expected.has(id)) continue
    result.set(id, {
      id,
      score: clampScore(item?.score),
      issues: normalizeIssues(item?.issues)
    })
  }
  return result
}

function qualityPrompt(entries: SubtitleEntry[], options: QualityOptions): string {
  const lines = entries.map(entry => JSON.stringify({
    id: String(entry.id),
    source: entry.text,
    translated: entry.translatedText || ''
  })).join('\n')
  return `请审核以下影视字幕译文质量。目标语言：${options.targetLanguage}。
${options.context?.title ? `作品：${options.context.title}\n` : ''}${options.stylePrompt ? `翻译风格要求：${options.stylePrompt}\n` : ''}
评分标准：
- 0.9-1.0：准确、自然、无明显问题
- 0.7-0.89：基本准确，有轻微措辞或风格问题
- 0.4-0.69：存在漏译、增译、误译或明显不自然
- 0-0.39：严重错误或不可用

问题标签只能使用：${QUALITY_ISSUES.join(', ')}。
只输出 JSON，不要 markdown：
{"items":[{"id":"1","score":0.92,"issues":[]}]}

待审核：
${lines}`
}

async function callQualityBatch(provider: BoundTranslationProvider, batch: SubtitleEntry[], options: QualityOptions, signal?: AbortSignal) {
  const response = await provider.complete({
    system: '你是严格的影视字幕质量审核员。只按指定 JSON 格式输出评分，不要解释。',
    prompt: qualityPrompt(batch, options),
    model: options.model,
    stream: false,
    temperature: 0.1,
    signal
  })
  return parseQualityResponse(response.content, batch.map(entry => String(entry.id)))
}

export const QualityService = {
  async evaluate(taskId: string, entries: SubtitleEntry[], options: QualityOptions, signal?: AbortSignal) {
    const db = useDb()
    const provider = createProvider({
      type: normalizeProviderType(options.providerType),
      apiKey: options.apiKey,
      baseUrl: options.baseUrl,
      model: options.model
    })
    const maxEntries = Math.max(1, Math.min(1000, Number(options.maxEntries) || 200))
    let selected = entries.filter(entry => String(entry.translatedText || '').trim())
    if (selected.length > maxEntries) {
      const step = selected.length / maxEntries
      selected = Array.from({ length: maxEntries }, (_, index) => selected[Math.floor(index * step)]).filter(Boolean) as SubtitleEntry[]
    }

    const scores = new Map<string, QualityEntryResult>()
    const issueCounts = new Map<string, number>()
    let checked = 0
    try {
      for (let index = 0; index < selected.length; index += 25) {
        if (signal?.aborted) throw new Error('任务已取消')
        const batch = selected.slice(index, index + 25)
        const batchScores = await callQualityBatch(provider, batch, options, signal)
        for (const [id, item] of batchScores) {
          scores.set(id, item)
          checked++
          for (const issue of item.issues) {
            issueCounts.set(issue, (issueCounts.get(issue) || 0) + 1)
          }
        }
      }
      if (selected.length > 0 && scores.size === 0) {
        throw new Error('质量校验未返回可解析评分')
      }
      const avgScore = scores.size
        ? Array.from(scores.values()).reduce((sum, item) => sum + item.score, 0) / scores.size
        : 0
      const issueSummary = Object.fromEntries(issueCounts)
      const run = db.prepare(`
        INSERT INTO translation_quality_runs (task_id, provider, model, status, entries_checked, avg_score, issues_json, created_at)
        VALUES (?, ?, ?, 'done', ?, ?, ?, datetime('now'))
      `).run(taskId, normalizeProviderType(options.providerType), options.model, checked, avgScore, JSON.stringify(issueSummary))
      const runId = Number(run.lastInsertRowid)
      const stmt = db.prepare(`
        INSERT INTO translation_quality_entries (run_id, task_id, subtitle_id, score, issues_json, source_text, translated_text, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
      `)
      for (const entry of selected) {
        const result = scores.get(String(entry.id))
        if (!result) continue
        stmt.run(runId, taskId, String(entry.id), result.score, JSON.stringify(result.issues), entry.text, entry.translatedText || '')
      }
      return {
        runId,
        checked,
        avgScore,
        issueSummary,
        scores,
        issues: Array.from(scores.entries())
          .filter(([, item]) => item.score > 0 && item.score < options.threshold)
          .map(([id, item]) => ({ id, reason: 'low_quality_translation', severity: 'soft' as const, score: item.score, qualityIssues: item.issues }))
      }
    } catch (error: any) {
      try {
        db.prepare(`
          INSERT INTO translation_quality_runs (task_id, provider, model, status, entries_checked, avg_score, issues_json, error, created_at)
          VALUES (?, ?, ?, 'error', ?, 0, '{}', ?, datetime('now'))
        `).run(taskId, normalizeProviderType(options.providerType), options.model, checked, String(error?.message || error))
      } catch { /* best effort */ }
      throw error
    }
  },

  getLatest(taskId: string) {
    const db = useDb()
    const run = db.prepare(`
      SELECT * FROM translation_quality_runs WHERE task_id = ? ORDER BY id DESC LIMIT 1
    `).get(taskId) as any
    if (!run) return null
    const entries = db.prepare(`
      SELECT subtitle_id, score, issues_json FROM translation_quality_entries
      WHERE run_id = ? ORDER BY CAST(subtitle_id AS INTEGER) ASC
    `).all(run.id) as any[]
    return {
      id: Number(run.id),
      provider: run.provider,
      model: run.model,
      status: run.status,
      entriesChecked: Number(run.entries_checked || 0),
      avgScore: Number(run.avg_score || 0),
      issueSummary: JSON.parse(run.issues_json || '{}'),
      error: run.error || '',
      createdAt: run.created_at,
      entries: entries.map(entry => ({
        subtitleId: String(entry.subtitle_id),
        score: Number(entry.score || 0),
        issues: JSON.parse(entry.issues_json || '[]')
      }))
    }
  }
}
