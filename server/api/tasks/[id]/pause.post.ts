import { apiError } from '../../../utils/apiError'
import { useDb } from '../../../utils/db'
import { TaskService, globalTaskQueue } from '../../../utils/task'

export default defineEventHandler(async (event) => {
  const taskId = getRouterParam(event, 'id')
  if (!taskId) throw apiError(400, 'Task ID is required')
  const task = TaskService.getTask(taskId)
  if (task.status === 'paused') return { success: true, status: 'paused', pending: false, pauseRequested: false }
  if (['done', 'error', 'cancelled', 'review'].includes(String(task.status))) {
    throw apiError(409, '任务已结束，无法暂停')
  }
  if (task.sourceType !== 'asr') {
    throw apiError(400, '当前仅语音识别任务支持暂停')
  }
  if (['parsing', 'translating', 'exporting'].includes(String(task.status))) {
    throw apiError(409, '语音识别已完成，无法暂停')
  }

  const db = useDb()
  const running = globalTaskQueue.isActive(taskId)
  if (running) {
    db.prepare("UPDATE tasks SET pause_requested_at = datetime('now'), updated_at = datetime('now') WHERE task_id = ? AND status NOT IN ('done', 'error', 'cancelled', 'review', 'paused')").run(taskId)
    const latest = db.prepare('SELECT status, progress, step_progress FROM tasks WHERE task_id = ?').get(taskId) as { status?: string, progress?: number, step_progress?: number } | undefined
    if (!latest?.status || ['done', 'error', 'cancelled', 'review'].includes(latest.status)) {
      throw apiError(409, '任务已结束，无法暂停')
    }
    const pauseRequestedAt = new Date().toISOString()
    await TaskService.updateStatus(taskId, latest.status as any, Number(latest.progress || 0), {
      stepProgress: Number(latest.step_progress || 0),
      stepMessage: '正在暂停，等待当前识别分段完成',
      log: '收到暂停请求，等待当前识别分段完成。',
      level: 'warn',
      pauseRequested: true,
      pauseRequestedAt
    })
    globalTaskQueue.pause(taskId)
    return { success: true, status: 'pausing', pending: true, pauseRequested: true, pauseRequestedAt }
  }

  db.prepare("UPDATE tasks SET pause_requested_at = NULL, updated_at = datetime('now') WHERE task_id = ?").run(taskId)
  const latest = db.prepare('SELECT progress, step_progress FROM tasks WHERE task_id = ?').get(taskId) as { progress?: number, step_progress?: number } | undefined
  await TaskService.updateStatus(taskId, 'paused', Number(latest?.progress || 0), {
    stepProgress: Number(latest?.step_progress || 0),
    stepMessage: '任务已暂停，已完成识别分段已保存',
    log: '任务已暂停，已完成识别分段已保存。',
    level: 'warn'
  })
  globalTaskQueue.pause(taskId)
  return { success: true, status: 'paused', pending: false, pauseRequested: false }
})
