import { requireScope } from '../utils/apiTokens'
import { TaskBatchService } from '../utils/taskBatches'

export default defineEventHandler((event) => {
  requireScope(event, 'tasks:read')
  const query = getQuery(event) as { limit?: string }
  return { batches: TaskBatchService.list(Number(query.limit || 50)) }
})
