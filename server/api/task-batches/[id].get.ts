import { apiError } from '../../utils/apiError'
import { requireScope } from '../../utils/apiTokens'
import { TaskBatchService } from '../../utils/taskBatches'

export default defineEventHandler((event) => {
  requireScope(event, 'tasks:read')
  const id = getRouterParam(event, 'id')
  if (!id) throw apiError(400, '批次 ID 不能为空')
  const batch = TaskBatchService.get(id)
  if (!batch) throw apiError(404, '批次不存在')
  return { batch, taskIds: TaskBatchService.taskIds(id) }
})
