import { apiError } from '../../../utils/apiError'
import { useDb } from '../../../utils/db'
import { ConfigService } from '../../../utils/config'
import { SubtitleService } from '../../../utils/subtitle'
import { translateChunkWithRetry } from '../../../utils/taskTranslate'
import { createProvider, normalizeProviderType } from '../../../utils/providers/registry'
import { TRANSLATION_CONTEXT_WINDOW } from '../../../utils/translation'
import { STYLE_PRESETS } from '~~/shared/stylePresets'
import { parseBody, reviewRetranslateSchema } from '../../../utils/validation'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) {
    throw apiError(400, 'Task ID is required')
  }

  const body = await parseBody(event, reviewRetranslateSchema)
  const subtitleIds = Array.isArray(body?.subtitleIds) ? body.subtitleIds.map((value: any) => String(value)) : []
  if (!subtitleIds.length) {
    throw apiError(400, 'subtitleIds are required')
  }

  const db = useDb()
  const task = db.prepare('SELECT * FROM tasks WHERE task_id = ?').get(id) as any
  if (!task) {
    throw apiError(404, 'Task not found')
  }
  if (!['done', 'error', 'review', 'cancelled'].includes(String(task.status))) {
    throw apiError(409, '任务仍在运行，暂时无法重新翻译')
  }

  const allRows = db.prepare(`
    SELECT subtitle_id, start_time, end_time, original_text, translated_text, final_text, review_status
    FROM task_review_entries
    WHERE task_id = ?
    ORDER BY sort_order ASC, CAST(subtitle_id AS INTEGER) ASC
  `).all(id) as any[]

  const selectedIdSet = new Set(subtitleIds)
  const rows = allRows.filter(row => selectedIdSet.has(String(row.subtitle_id)))
  if (!rows.length) {
    throw apiError(404, 'No review entries found')
  }

  const config = await ConfigService.getConfig(true)
  db.prepare("INSERT INTO task_logs (task_id, step, category, level, message, created_at) VALUES (?, 'review', 'translation', 'info', ?, datetime('now'))")
    .run(id, '[核对重译] 已开始重新翻译 ' + subtitleIds.length + ' 条字幕，本次将直接请求模型并跳过任务级缓存。')

  const provider = createProvider({
    type: normalizeProviderType((config as any).providerType),
    apiKey: config.apiKey,
    baseUrl: config.apiBaseUrl,
    model: task.model
  })

  const selectedEntries = rows.map(row => ({
    id: String(row.subtitle_id),
    startTime: row.start_time,
    endTime: row.end_time,
    text: row.original_text,
    translatedText: row.translated_text || ''
  }))

  const allStylePresets = [...STYLE_PRESETS, ...(Array.isArray(config.customStylePresets) ? config.customStylePresets : [])]
  const stylePrompt = String(task.style_prompt || allStylePresets.find(preset => preset.id === task.style_preset)?.prompt || '')
  const translationContext = {
    title: task.content_title || '',
    background: task.content_background || '',
    instructions: task.custom_instructions || ''
  }
  const maxRetries = Number(config.maxRetries || 3)
  const chunkSize = Math.max(100, Math.min(Number(config.chunkSize) || 2000, 3000))
  const chunks = SubtitleService.chunkByTokens(selectedEntries as any, chunkSize)
  const allResults: any[] = []
  const abortController = new AbortController()
  event.node.res.on('close', () => abortController.abort())

  for (let index = 0; index < chunks.length; index++) {
    const chunk = chunks[index]!
    const chunkRowIndexes = chunk
      .map(entry => allRows.findIndex(row => String(row.subtitle_id) === String(entry.id)))
      .filter(rowIndex => rowIndex >= 0)
    const firstIndex = chunkRowIndexes.length ? Math.min(...chunkRowIndexes) : -1
    const lastIndex = chunkRowIndexes.length ? Math.max(...chunkRowIndexes) : -1
    const previousContext = firstIndex > 0
      ? allRows.slice(Math.max(0, firstIndex - TRANSLATION_CONTEXT_WINDOW), firstIndex).map(row => ({
          id: String(row.subtitle_id),
          startTime: row.start_time,
          endTime: row.end_time,
          text: row.original_text,
          translatedText: row.final_text || row.translated_text || row.original_text
        }))
      : []
    const nextContext = lastIndex >= 0
      ? allRows.slice(lastIndex + 1, lastIndex + 1 + TRANSLATION_CONTEXT_WINDOW).map(row => ({
          id: String(row.subtitle_id),
          startTime: row.start_time,
          endTime: row.end_time,
          text: row.original_text,
          translatedText: ''
        }))
      : []

    const result = await translateChunkWithRetry(
      provider,
      chunk as any,
      task.target_lang,
      config.glossary || {},
      previousContext as any,
      task.model,
      id,
      index,
      stylePrompt,
      maxRetries,
      undefined,
      false,
      false,
      `核对重译块 #${index + 1}`,
      abortController.signal,
      translationContext,
      nextContext as any
    )
    allResults.push(...result.entries)
  }

  const repaired = SubtitleService.repairTranslatedEntries(allResults as any, task.target_lang, task.output_mode || 'translated')
  const reviewedResults = repaired.entries

  const issues = SubtitleService.validateTranslatedEntries(reviewedResults as any, task.target_lang)
  const issueMap = new Map<string, string[]>()
  for (const issue of issues) {
    const list = issueMap.get(String(issue.id)) || []
    list.push(issue.reason)
    issueMap.set(String(issue.id), list)
  }

  const stmt = db.prepare(`
    UPDATE task_review_entries
    SET translated_text = ?, final_text = ?, review_status = ?, review_reasons = ?, quality_score = NULL, quality_issues = '[]', edited = 0, updated_at = datetime('now')
    WHERE task_id = ? AND subtitle_id = ?
  `)

  db.exec('BEGIN')
  let updated: any[] = []
  try {
    updated = reviewedResults.map((entry: any) => {
      const reasons = issueMap.get(String(entry.id)) || []
      const status = reasons.length === 0
        ? (SubtitleService.normalizeComparisonText(entry.translatedText) === SubtitleService.normalizeComparisonText(entry.text) ? 'accepted_same' : 'translated')
        : 'needs_review'

      stmt.run(
        String(entry.translatedText || ''),
        String(entry.translatedText || entry.text || ''),
        status,
        JSON.stringify(reasons),
        id,
        String(entry.id)
      )

      return {
        subtitleId: String(entry.id),
        translatedText: entry.translatedText || '',
        finalText: entry.translatedText || entry.text || '',
        reviewStatus: status,
        reviewReasons: reasons
      }
    })
    db.exec('COMMIT')
  } catch (error) {
    try { db.exec('ROLLBACK') } catch { /* ignore rollback failure */ }
    throw error
  }

  db.prepare("INSERT INTO task_logs (task_id, step, category, level, message, created_at) VALUES (?, 'review', 'translation', 'info', ?, datetime('now'))")
    .run(id, `[核对重译] 已按 ${chunks.length} 个分块重新翻译 ${updated.length} 条字幕（已跳过任务级缓存）。`)

  return { success: true, chunks: chunks.length, entries: updated }
})
