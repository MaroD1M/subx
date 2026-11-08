import { apiError } from '../../utils/apiError'
import { requireScope } from '../../utils/apiTokens'
import { NotificationService } from '../../utils/notifications'

export default defineEventHandler(async (event) => {
  requireScope(event, 'automation:write')
  const id = Number(getRouterParam(event, 'id'))
  if (!Number.isInteger(id) || id <= 0) throw apiError(400, '通知渠道 ID 不合法')
  if (!NotificationService.deleteChannel(id)) throw apiError(404, '通知渠道不存在')
  return { success: true }
})
