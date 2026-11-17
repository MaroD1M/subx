import { apiError } from '../../../utils/apiError'
import { requireScope } from '../../../utils/apiTokens'
import { ReviewVersionService } from '../../../utils/reviewVersions'

export default defineEventHandler((event) => {
  requireScope(event, 'tasks:read')
  const taskId = getRouterParam(event, 'id')
  if (!taskId) throw apiError(400, 'Task ID is required')
  return { versions: ReviewVersionService.list(taskId) }
})
