import { apiError } from '../../../utils/apiError'
import { requireScope } from '../../../utils/apiTokens'
import { TaskBatchService } from '../../../utils/taskBatches'
import { NotificationService } from '../../../utils/notifications'

export default defineEventHandler((event) => {
  requireScope(event, 'tasks:write')
  const id = getRouterParam(event, 'id')
  if (!id) throw apiError(400, '批次 ID 不能为空')
  const batch = TaskBatchService.pause(id)
  if (!batch) throw apiError(404, '批次不存在')
  void NotificationService.notifyBatchEvent(batch, 'batch_paused').catch(error => console.warn('[Batch] Failed to enqueue pause notification:', error?.message || error))
  return { batch }
})
