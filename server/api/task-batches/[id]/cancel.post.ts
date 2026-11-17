import { apiError } from '../../../utils/apiError'
import { requireScope } from '../../../utils/apiTokens'
import { TaskBatchService } from '../../../utils/taskBatches'
import { TaskService, globalTaskQueue } from '../../../utils/task'

const TERMINAL = new Set(['done', 'error', 'cancelled', 'review'])

export default defineEventHandler(async (event) => {
  requireScope(event, 'tasks:write')
  const id = getRouterParam(event, 'id')
  if (!id) throw apiError(400, '批次 ID 不能为空')
  const taskIds = TaskBatchService.taskIds(id)
  for (const taskId of taskIds) {
    try {
      const task = TaskService.getTask(taskId)
      if (TERMINAL.has(String(task.status))) continue
      globalTaskQueue.cancel(taskId)
      await TaskService.updateStatus(taskId, 'cancelled', task.progress, {
        error: '批次已取消',
        stepMessage: '任务已随批次取消',
        log: '任务已随批次取消。',
        level: 'warn'
      })
    } catch { /* keep cancelling the rest */ }
  }
  const batch = TaskBatchService.cancel(id)
  if (!batch) throw apiError(404, '批次不存在')
  return { batch }
})
