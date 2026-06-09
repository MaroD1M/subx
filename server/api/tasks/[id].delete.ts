import { useDb } from '../../utils/db'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, message: 'Task ID is required' })
  }

  const db = useDb()

  try {
    const task = db.prepare('SELECT task_id FROM tasks WHERE task_id = ?').get(id) as any
    if (!task) {
      throw createError({ statusCode: 404, message: 'Task not found' })
    }

    db.prepare('DELETE FROM task_logs WHERE task_id = ?').run(id)
    db.prepare('DELETE FROM task_review_entries WHERE task_id = ?').run(id)
    db.prepare('DELETE FROM task_responses WHERE task_id = ?').run(id)
    const info = db.prepare('DELETE FROM tasks WHERE task_id = ?').run(id)

    return { success: true, deletedCount: info.changes }
  } catch (error: any) {
    if (error?.statusCode) throw error
    console.error('Failed to delete task:', error)
    throw createError({ statusCode: 500, message: 'Failed to delete task' })
  }
})
