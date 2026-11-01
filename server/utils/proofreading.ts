/**
 * AI-assisted glossary extraction and consistency review.
 *
 * Reviews a sample of the current task's subtitles and returns structured term
 * and issue suggestions. Suggestions are advisory; the user explicitly applies
 * terms to the global glossary.
 */

import { useDb } from './db'
import { ConfigService } from './config'
import { createProvider, normalizeProviderType } from './providers/registry'

export type ProofreadKind = 'glossary' | 'consistency'

export interface ProofreadResult {
  terms: Array<{ source: string, target: string, reason: string }>
  issues: Array<{ subtitleId: string, type: string, message: string }>
}

function extractJson(raw: string): any | null {
  const text = String(raw || '').trim()
  if (!text) return null
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const candidate = fenced?.[1]?.trim() || text
  const start = candidate.indexOf('{')
  const end = candidate.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  try { return JSON.parse(candidate.slice(start, end + 1)) } catch { return null }
}

export function parseProofreadResponse(raw: string): ProofreadResult {
  const parsed = extractJson(raw)
  const terms = Array.isArray(parsed?.terms)
    ? parsed.terms
      .map((item: any) => ({
        source: String(item?.source || '').trim(),
        target: String(item?.target || '').trim(),
        reason: String(item?.reason || '').trim()
      }))
      .filter((item: any) => item.source && item.target)
    : []
  const issues = Array.isArray(parsed?.issues)
    ? parsed.issues
      .map((item: any) => ({
        subtitleId: String(item?.subtitleId || item?.id || '').trim(),
        type: String(item?.type || 'other').trim(),
        message: String(item?.message || '').trim()
      }))
      .filter((item: any) => item.message)
    : []
  return { terms, issues }
}

function buildPrompt(kind: ProofreadKind, rows: any[]): string {
  const lines = rows.map(row => JSON.stringify({
    id: String(row.subtitle_id),
    source: row.original_text,
    translated: row.translated_text || row.final_text || ''
  })).join('\n')
  if (kind === 'glossary') {
    return `请从以下影视字幕中提取值得加入术语表的专有名词、人名、地名、组织名、称号和固定译法。
只提取在译文中已经出现且值得保持一致的词条。不要编造。
只输出 JSON：
{"terms":[{"source":"原文","target":"建议译文","reason":"简要原因"}],"issues":[]}

字幕：
${lines}`
  }
  return `请检查以下影视字幕的译文一致性，重点检查人名、地名、术语、称号是否前后不一致，以及明显误译。
只输出 JSON：
{"terms":[{"source":"原文","target":"建议统一译法","reason":"简要原因"}],"issues":[{"subtitleId":"1","type":"name_inconsistency","message":"问题说明"}]}

字幕：
${lines}`
}

export const ProofreadingService = {
  async suggest(taskId: string, kind: ProofreadKind): Promise<ProofreadResult> {
    const db = useDb()
    const task = db.prepare('SELECT * FROM tasks WHERE task_id = ?').get(taskId) as any
    if (!task) throw new Error('任务不存在')
    const allRows = db.prepare(`
      SELECT subtitle_id, original_text, translated_text, final_text
      FROM task_review_entries WHERE task_id = ?
      ORDER BY sort_order ASC, CAST(subtitle_id AS INTEGER) ASC
    `).all(taskId) as any[]
    if (!allRows.length) throw new Error('没有可校对的字幕条目')
    const limit = 160
    let rows = allRows
    if (rows.length > limit) {
      const step = rows.length / limit
      rows = Array.from({ length: limit }, (_, index) => rows[Math.floor(index * step)]).filter(Boolean)
    }
    const config = await ConfigService.getConfig(true)
    if (!config.apiKey) throw new Error('请先在设置页配置 AI 接口密钥')
    const provider = createProvider({
      type: normalizeProviderType(config.providerType),
      apiKey: config.apiKey,
      baseUrl: config.apiBaseUrl,
      model: task.model || config.defaultModel
    })
    const response = await provider.complete({
      system: '你是专业影视字幕校对和术语管理专家。严格只输出 JSON，不要解释。',
      prompt: buildPrompt(kind, rows),
      model: task.model || config.defaultModel,
      stream: false,
      temperature: 0.1
    })
    const result = parseProofreadResponse(response.content)
    if (!result.terms.length && !result.issues.length) {
      throw new Error('AI 未返回可解析的校对结果')
    }
    return result
  }
}
