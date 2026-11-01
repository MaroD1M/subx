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
  const rows = db.prepare(`
    SELECT id, task_id, step, category, level, message, created_at
    FROM task_logs
    WHERE task_id = ?
    ORDER BY id ASC
  `).all(id) as any[]

  return {
    logs: rows.map(row => ({
      id: row.id,
      taskId: row.task_id,
      step: row.step,
      category: row.category || 'system',
      level: row.level,
      message: row.message,
      createdAt: toUtcIsoString(row.created_at)
    }))
  }
})
