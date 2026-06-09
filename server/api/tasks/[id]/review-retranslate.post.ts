import OpenAI from 'openai'
import { useDb } from '../../../utils/db'
import { ConfigService } from '../../../utils/config'
import { TranslationService } from '../../../utils/translation'
import { SubtitleService } from '../../../utils/subtitle'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, message: 'Task ID is required' })
  }

  const body = await readBody(event)
  const subtitleIds = Array.isArray(body?.subtitleIds) ? body.subtitleIds.map((value: any) => String(value)) : []
  if (!subtitleIds.length) {
    throw createError({ statusCode: 400, message: 'subtitleIds are required' })
  }

  const db = useDb()
  const task = db.prepare('SELECT * FROM tasks WHERE task_id = ?').get(id) as any
  if (!task) {
    throw createError({ statusCode: 404, message: 'Task not found' })
  }

  const rows = db.prepare(`
    SELECT subtitle_id, start_time, end_time, original_text, translated_text, final_text, review_status
    FROM task_review_entries
    WHERE task_id = ? AND subtitle_id IN (${subtitleIds.map(() => '?').join(',')})
    ORDER BY CAST(subtitle_id AS INTEGER) ASC
  `).all(id, ...subtitleIds) as any[]

  if (!rows.length) {
    throw createError({ statusCode: 404, message: 'No review entries found' })
  }

  const config = await ConfigService.getConfig(true)
  db.prepare("INSERT INTO task_logs (task_id, step, category, level, message, created_at) VALUES (?, 'review', 'translation', 'info', ?, datetime('now'))")
    .run(id, '[核对重译] 已开始重新翻译 ' + subtitleIds.length + ' 条字幕，本次将直接请求模型并跳过任务级缓存。')

  const openai = new OpenAI({
    apiKey: config.apiKey,
    baseURL: config.apiBaseUrl
  })

  const selectedEntries = rows.map(row => ({
    id: String(row.subtitle_id),
    startTime: row.start_time,
    endTime: row.end_time,
    text: row.original_text,
    translatedText: row.translated_text || ''
  }))

  const chunkSize = Math.max(100, Math.min(Number(config.chunkSize) || 2000, 3000))
  const chunks = SubtitleService.chunkByTokens(selectedEntries as any, chunkSize)
  const allResults: any[] = []

  for (let index = 0; index < chunks.length; index++) {
    const chunk = chunks[index]
    const results = await TranslationService.translateChunk(
      openai,
      chunk as any,
      task.target_lang,
      config.glossary || {},
      [],
      task.model,
      `${id}-review`,
      index,
      '',
      undefined,
      false,
      0,
      false
    )
    allResults.push(...results)
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
    SET translated_text = ?, final_text = ?, review_status = ?, review_reasons = ?, edited = 0, updated_at = datetime('now')
    WHERE task_id = ? AND subtitle_id = ?
  `)

  const updated = reviewedResults.map((entry: any) => {
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

  db.prepare("INSERT INTO task_logs (task_id, step, category, level, message, created_at) VALUES (?, 'review', 'translation', 'info', ?, datetime('now'))")
    .run(id, `[核对重译] 已按 ${chunks.length} 个分块重新翻译 ${updated.length} 条字幕（已跳过任务级缓存）。`)

  return { success: true, chunks: chunks.length, entries: updated }
})
