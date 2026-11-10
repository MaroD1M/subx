import { apiError } from '../../../utils/apiError'
import { toUtcIsoString } from '~~/shared/time'
import { useDb } from '../../../utils/db'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) {
    throw apiError(400, 'Task ID is required')
  }

  const query = getQuery(event) as { limit?: string }
  const limit = Math.min(5000, Math.max(1, Math.floor(Number(query.limit) || 2000)))
  const db = useDb()
  const totalRow = db.prepare('SELECT COUNT(*) AS count FROM task_logs WHERE task_id = ?').get(id) as { count?: number } | undefined
  const total = Number(totalRow?.count || 0)
  const rows = db.prepare(`
    SELECT id, task_id, step, category, level, message, created_at
    FROM (
      SELECT id, task_id, step, category, level, message, created_at
      FROM task_logs
      WHERE task_id = ?
      ORDER BY id DESC
      LIMIT ?
    ) recent
    ORDER BY id ASC
  `).all(id, limit) as any[]

  return {
    logs: rows.map(row => ({
      id: row.id,
      taskId: row.task_id,
      step: row.step,
      category: row.category || 'system',
      level: row.level,
      message: row.message,
      createdAt: toUtcIsoString(row.created_at)
    })),
    total,
    limit,
    truncated: total > rows.length
  }
})
