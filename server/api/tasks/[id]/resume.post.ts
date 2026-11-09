import { apiError } from '../../../utils/apiError'
import { ConfigService } from '../../../utils/config'
import { TaskService, globalTaskQueue } from '../../../utils/task'

export default defineEventHandler(async (event) => {
  const taskId = getRouterParam(event, 'id')
  if (!taskId) throw apiError(400, 'Task ID is required')
  const task = TaskService.getTask(taskId)
  if (task.status !== 'paused') throw apiError(409, '任务不在暂停状态')
  if (globalTaskQueue.isActive(taskId)) {
    throw apiError(409, '当前识别分段仍在完成中，请稍后再继续')
  }
  const config = await ConfigService.getConfig()
  await TaskService.updateStatus(taskId, 'queued', task.progress, {
    stepMessage: '正在恢复任务...',
    log: '任务已恢复，将复用已完成的识别分段。'
  })
  await globalTaskQueue.add(taskId, { apiKey: config.apiKey, baseUrl: config.apiBaseUrl })
  return { success: true, status: 'queued' }
})
