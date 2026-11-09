import { apiError } from '../../../utils/apiError'
import { TaskService, globalTaskQueue } from '../../../utils/task'

export default defineEventHandler(async (event) => {
  const taskId = getRouterParam(event, 'id')
  if (!taskId) throw apiError(400, 'Task ID is required')
  const task = TaskService.getTask(taskId)
  if (task.status === 'paused') return { success: true, status: 'paused' }
  if (['done', 'error', 'cancelled', 'review'].includes(String(task.status))) {
    throw apiError(409, '任务已结束，无法暂停')
  }
  if (task.sourceType !== 'asr') {
    throw apiError(400, '当前仅语音识别任务支持暂停')
  }
  if (['parsing', 'translating', 'exporting'].includes(String(task.status))) {
    throw apiError(409, '语音识别已完成，无法暂停')
  }
  globalTaskQueue.pause(taskId)
  await TaskService.updateStatus(taskId, 'paused', task.progress, {
    stepMessage: '正在暂停，等待当前识别分段完成',
    log: '收到暂停请求，等待当前识别分段完成。',
    level: 'warn'
  })
  return { success: true, status: 'paused' }
})
