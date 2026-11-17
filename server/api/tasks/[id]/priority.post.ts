import { apiError } from '../../../utils/apiError'
import { requireScope } from '../../../utils/apiTokens'
import { useDb } from '../../../utils/db'
import { TaskService, globalTaskQueue } from '../../../utils/task'
import { parseBody, taskPrioritySchema } from '../../../utils/validation'

const TERMINAL = new Set(['done', 'error', 'cancelled', 'review'])

export default defineEventHandler(async (event) => {
  requireScope(event, 'tasks:write')
  const taskId = getRouterParam(event, 'id')
  if (!taskId) throw apiError(400, 'Task ID is required')
  const body = await parseBody(event, taskPrioritySchema)
  const task = TaskService.getTask(taskId)
  if (TERMINAL.has(String(task.status))) throw apiError(409, '任务已结束，无法调整优先级')
  const priority = Math.max(-1000, Math.min(1000, Math.floor(Number(body.priority) || 0)))
  const db = useDb()
  const job = db.prepare('SELECT status FROM task_jobs WHERE task_id = ?').get(taskId) as { status?: string } | undefined
  if (!job) throw apiError(404, '任务队列记录不存在')
  if (!['queued', 'paused'].includes(String(job.status || ''))) {
    throw apiError(409, '任务已开始执行，无法调整队列优先级')
  }
  db.prepare("UPDATE task_jobs SET priority = ?, updated_at = datetime('now') WHERE task_id = ?").run(priority, taskId)
  void globalTaskQueue.wake()
  return { success: true, priority }
})
