import { apiError } from '../../../utils/apiError'
import { useDb } from '../../../utils/db'
import { TaskService } from '../../../utils/task'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) {
    throw apiError(400, 'Task ID is required')
  }

  const db = useDb()
  const task = db.prepare('SELECT status FROM tasks WHERE task_id = ?').get(id) as { status?: string } | undefined
  if (!task) {
    throw apiError(404, 'Task not found')
  }
  if (task.status === 'cancelled' || task.status === 'error') {
    return { success: false, message: '任务已结束' }
  }

  try { db.prepare('DELETE FROM task_proofread_cache WHERE task_id = ?').run(id) } catch { /* old schema */ }
  await TaskService.updateStatus(id, 'error', 0, {
    error: '翻译成果已放弃',
    stepMessage: '翻译成果已放弃',
    log: '已放弃本次翻译成果。'
  })
  return { success: true }
})
