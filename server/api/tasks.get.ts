import { useDb } from '../utils/db'
import { getMediaRoot } from '../utils/mediaRoots'
import { taskListQuerySchema } from '../utils/validation'

function toUtcIsoString(value: string | null | undefined) {
  if (!value) return value || ''
  return value.includes('T') ? value : value.replace(' ', 'T') + 'Z'
}

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const parsed = taskListQuerySchema.safeParse(query)
  if (!parsed.success) {
    throw createError({ statusCode: 400, message: '分页参数不合法' })
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
    SELECT * FROM tasks
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

    return {
      ...task,
      taskId: task.task_id,
      filePath: task.file_path,
      rootId: task.root_id,
      rootName,
      sourceType: task.source_type,
      trackIndex: task.track_index,
      targetLanguage: task.target_lang,
      outputMode: task.output_mode,
      stepProgress: Number(task.step_progress || 0),
      stepMessage: task.step_message || '',
      totalChunks: task.total_chunks,
      completedChunks: task.done_chunks,
      createdAt: toUtcIsoString(task.created_at),
      updatedAt: toUtcIsoString(task.updated_at)
    }
  }))

  return { tasks, totalItems: tasks.length, total, page, pageSize }
})
