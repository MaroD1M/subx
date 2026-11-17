import { apiError } from '../../utils/apiError'
import { requireScope } from '../../utils/apiTokens'
import { TaskBatchService } from '../../utils/taskBatches'
import { parseBody, taskBatchUpdateSchema } from '../../utils/validation'

export default defineEventHandler(async (event) => {
  requireScope(event, 'tasks:write')
  const id = getRouterParam(event, 'id')
  if (!id) throw apiError(400, '批次 ID 不能为空')
  const body = await parseBody(event, taskBatchUpdateSchema)
  const batch = TaskBatchService.update(id, body)
  if (!batch) throw apiError(404, '批次不存在')
  return { batch }
})
