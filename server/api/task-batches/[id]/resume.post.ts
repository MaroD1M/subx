import { apiError } from '../../../utils/apiError'
import { requireScope } from '../../../utils/apiTokens'
import { TaskBatchService } from '../../../utils/taskBatches'
import { globalTaskQueue } from '../../../utils/task'
import { NotificationService } from '../../../utils/notifications'

export default defineEventHandler(async (event) => {
  requireScope(event, 'tasks:write')
  const id = getRouterParam(event, 'id')
  if (!id) throw apiError(400, '批次 ID 不能为空')
  const batch = TaskBatchService.resume(id)
  if (!batch) throw apiError(404, '批次不存在')
  await globalTaskQueue.wake()
  void NotificationService.notifyBatchEvent(batch, 'batch_started').catch(error => console.warn('[Batch] Failed to enqueue resume notification:', error?.message || error))
  return { batch }
})
