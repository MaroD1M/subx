import { useDb } from '../../../utils/db'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, message: 'Task ID is required' })
  }

  const db = useDb()
  db.prepare("UPDATE tasks SET status = 'error', error = ?, updated_at = datetime('now') WHERE task_id = ?").run('翻译成果已放弃', id)
  db.prepare("INSERT INTO task_logs (task_id, step, category, level, message, created_at) VALUES (?, 'error', 'error', 'warn', ?, datetime('now'))").run(id, '已放弃本次翻译成果。')
  return { success: true }
})
