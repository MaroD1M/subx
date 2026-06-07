import { useDb } from '../../../utils/db'

function toUtcIsoString(value: string | null | undefined) {
  if (!value) return value || ''
  return value.includes('T') ? value : value.replace(' ', 'T') + 'Z'
}

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, message: 'Task ID is required' })
  }

  const db = useDb()
  const task = db.prepare('SELECT task_id, status, output_mode, subtitle_format, subtitle_style_preset, bilingual_layout, target_lang, file_path, root_id FROM tasks WHERE task_id = ?').get(id) as any
  if (!task) {
    throw createError({ statusCode: 404, message: 'Task not found' })
  }

  const entries = db.prepare(`
    SELECT id, task_id, subtitle_id, start_time, end_time, original_text, translated_text, final_text, review_status, review_reasons, selected, edited, created_at, updated_at
    FROM task_review_entries
    WHERE task_id = ?
    ORDER BY CAST(subtitle_id AS INTEGER) ASC, id ASC
  `).all(id) as any[]

  return {
    task: {
      taskId: task.task_id,
      status: task.status,
      outputMode: task.output_mode,
      subtitleFormat: task.subtitle_format,
      subtitleStylePreset: task.subtitle_style_preset,
      bilingualLayout: task.bilingual_layout,
      targetLanguage: task.target_lang,
      filePath: task.file_path,
      rootId: task.root_id
    },
    summary: {
      total: entries.length,
      needsReview: entries.filter(entry => ['needs_review', 'fallback_original', 'missing'].includes(entry.review_status)).length,
      edited: entries.filter(entry => entry.edited === 1).length
    },
    entries: entries.map(entry => ({
      id: entry.id,
      taskId: entry.task_id,
      subtitleId: entry.subtitle_id,
      startTime: entry.start_time,
      endTime: entry.end_time,
      originalText: entry.original_text,
      translatedText: entry.translated_text || '',
      finalText: entry.final_text || entry.translated_text || entry.original_text,
      reviewStatus: entry.review_status,
      reviewReasons: JSON.parse(entry.review_reasons || '[]'),
      selected: !!entry.selected,
      edited: !!entry.edited,
      createdAt: toUtcIsoString(entry.created_at),
      updatedAt: toUtcIsoString(entry.updated_at)
    }))
  }
})
