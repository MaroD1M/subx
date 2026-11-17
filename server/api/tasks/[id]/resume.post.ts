import { apiError } from '../../../utils/apiError'
import { ConfigService } from '../../../utils/config'
import { useDb } from '../../../utils/db'
import { TaskService, globalTaskQueue } from '../../../utils/task'
import { normalizeTaskRetryPolicy } from '../../../utils/taskRetry'

export default defineEventHandler(async (event) => {
  const taskId = getRouterParam(event, 'id')
  if (!taskId) throw apiError(400, 'Task ID is required')
  const task = TaskService.getTask(taskId)
  if (task.status !== 'paused') {
    if (task.pauseRequested) {
      throw apiError(409, '当前识别分段仍在完成中，请稍后再继续')
    }
    throw apiError(409, '任务不在暂停状态')
  }
  if (globalTaskQueue.isActive(taskId)) {
    throw apiError(409, '当前识别分段仍在完成中，请稍后再继续')
  }
  const config = await ConfigService.getConfig()
  const db = useDb()
  const job = db.prepare('SELECT batch_id, priority, retry_policy_json FROM task_jobs WHERE task_id = ?').get(taskId) as { batch_id?: string | null, priority?: number, retry_policy_json?: string } | undefined
  let retryPolicy: any = undefined
  try { retryPolicy = job?.retry_policy_json ? JSON.parse(String(job.retry_policy_json)) : undefined } catch { retryPolicy = undefined }
  db.prepare("UPDATE tasks SET pause_requested_at = NULL, updated_at = datetime('now') WHERE task_id = ?").run(taskId)
  await TaskService.updateStatus(taskId, 'queued', task.progress, {
    stepProgress: task.stepProgress,
    stepMessage: '正在恢复任务...',
    log: '任务已恢复，将复用已完成的识别分段。'
  })
  await globalTaskQueue.add(taskId, { apiKey: config.apiKey, baseUrl: config.apiBaseUrl }, {
    batchId: job?.batch_id || null,
    priority: job?.priority,
    scheduledAt: null,
    retryPolicy: retryPolicy ? normalizeTaskRetryPolicy(retryPolicy) : undefined
  })
  return { success: true, status: 'queued' }
})
