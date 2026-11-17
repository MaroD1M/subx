import { apiError } from '../../../../utils/apiError'
import { requireScope } from '../../../../utils/apiTokens'
import { ReviewVersionService } from '../../../../utils/reviewVersions'

export default defineEventHandler((event) => {
  requireScope(event, 'tasks:read')
  const taskId = getRouterParam(event, 'id')
  const versionId = Number(getRouterParam(event, 'versionId'))
  if (!taskId) throw apiError(400, 'Task ID is required')
  if (!Number.isInteger(versionId) || versionId <= 0) throw apiError(400, '版本 ID 不合法')
  const version = ReviewVersionService.get(taskId, versionId)
  if (!version) throw apiError(404, '版本不存在')
  return { version }
})
