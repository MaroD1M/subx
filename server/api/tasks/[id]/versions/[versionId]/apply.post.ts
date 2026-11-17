import { apiError } from '../../../../../utils/apiError'
import { requireScope } from '../../../../../utils/apiTokens'
import { ReviewVersionService } from '../../../../../utils/reviewVersions'

export default defineEventHandler((event) => {
  requireScope(event, 'tasks:write')
  const taskId = getRouterParam(event, 'id')
  const versionId = Number(getRouterParam(event, 'versionId'))
  if (!taskId) throw apiError(400, 'Task ID is required')
  if (!Number.isInteger(versionId) || versionId <= 0) throw apiError(400, '版本 ID 不合法')
  const auth = event.context.auth as { name?: string } | undefined
  try {
    return ReviewVersionService.apply(taskId, versionId, { createdBy: auth?.name || '' })
  } catch (error: any) {
    if (error?.statusCode) throw error
    throw apiError(400, error?.message || '回滚版本失败')
  }
})
