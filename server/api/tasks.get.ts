import { apiError } from '../utils/apiError'
import { toUtcIsoString } from '~~/shared/time'
import { useDb } from '../utils/db'
import { getMediaRoot } from '../utils/mediaRoots'
import { taskListQuerySchema } from '../utils/validation'
import { normalizeSubtitleStyle } from '~~/shared/subtitleStyles'

function isSubtitlePath(value: unknown) {
  return /\.(?:srt|ass|ssa|vtt)$/i.test(String(value || ''))
}

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const parsed = taskListQuerySchema.safeParse(query)
  if (!parsed.success) {
    throw apiError(400, '分页参数不合法')
  }
  const { page, pageSize, status, q } = parsed.data
  const db = useDb()

  const conditions: string[] = []
  const params: any[] = []
  if (status) {
    conditions.push('status = ?')
    params.push(String(status))
  }
  if (q) {
    conditions.push('file_path LIKE ?')
    params.push(`%${String(q)}%`)
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
  const totalRow = db.prepare(`SELECT COUNT(*) as count FROM tasks ${where}`).get(...params) as { count?: number } | undefined
  const total = Number(totalRow?.count || 0)
  const offset = (page - 1) * pageSize
  const rows = db.prepare(`
    SELECT tasks.*,
      (SELECT COUNT(*) FROM task_review_entries tre WHERE tre.task_id = tasks.task_id) AS review_entry_count
    FROM tasks
    ${where}
    ORDER BY created_at DESC
    LIMIT ? OFFSET ?
  `).all(...params, pageSize, offset) as any[]

  const tasks = await Promise.all(rows.map(async task => {
    let rootName = '默认媒体库'
    try {
      const root = await getMediaRoot(task.root_id)
      rootName = root.name
    } catch {
      // ignore fallback
    }

    const reviewEntryCount = Number(task.review_entry_count || 0)
    const terminalStatus = ['done', 'error', 'cancelled', 'review'].includes(String(task.status))
    const subtitleStyle = (() => {
      try { return task.subtitle_style_json ? normalizeSubtitleStyle(JSON.parse(task.subtitle_style_json), task.output_mode) : undefined } catch { return undefined }
    })()
    return {
      ...task,
      taskId: task.task_id,
      reviewEntryCount,
      reviewAvailable: terminalStatus && (reviewEntryCount > 0 || isSubtitlePath(task.output_path) || isSubtitlePath(task.source_subtitle_path) || isSubtitlePath(task.file_path)),
      filePath: task.file_path,
      rootId: task.root_id,
      seriesKey: task.series_key || undefined,
      rootName,
      sourceType: task.source_type,
      trackIndex: task.track_index,
      sourceLanguage: task.source_lang || '',
      targetLanguage: task.target_lang,
      outputMode: task.output_mode,
      stylePreset: task.style_preset || 'default',
      subtitleFormat: task.subtitle_format || 'srt',
      subtitleStylePreset: subtitleStyle?.presetId || task.subtitle_style_preset || 'bilingual_simple',
      subtitleStyle,
      bilingualLayout: task.bilingual_layout || 'translated_first',
      stepProgress: Number(task.step_progress || 0),
      stepMessage: task.step_message || '',
      totalChunks: task.total_chunks,
      completedChunks: task.done_chunks,
      createdAt: toUtcIsoString(task.created_at),
      updatedAt: toUtcIsoString(task.updated_at),
      startedAt: task.started_at ? toUtcIsoString(task.started_at) : undefined,
      stepStartedAt: task.step_started_at ? toUtcIsoString(task.step_started_at) : undefined,
      finishedAt: task.finished_at ? toUtcIsoString(task.finished_at) : undefined,
      pausedAt: task.paused_at ? toUtcIsoString(task.paused_at) : undefined,
      pausedTotalMs: Number(task.paused_total_ms || 0)
    }
  }))

  return { tasks, totalItems: tasks.length, total, page, pageSize }
})
