import { requireScope } from '../../utils/apiTokens'
import { NotificationService } from '../../utils/notifications'

export default defineEventHandler(async (event) => {
  requireScope(event, 'automation:write')
  const id = Number(getRouterParam(event, 'id'))
  if (!Number.isInteger(id) || id <= 0) throw createError({ statusCode: 400, message: '通知渠道 ID 不合法' })
  if (!NotificationService.deleteChannel(id)) throw createError({ statusCode: 404, message: '通知渠道不存在' })
  return { success: true }
})
