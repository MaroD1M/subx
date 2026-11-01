import { requireScope } from '../utils/apiTokens'
import { NotificationService } from '../utils/notifications'
import { notificationChannelSchema, parseBody } from '../utils/validation'

export default defineEventHandler(async (event) => {
  requireScope(event, 'automation:write')
  const body = await parseBody(event, notificationChannelSchema)
  try {
    const channel = NotificationService.upsertChannel(body as any)
    return { channel: channel ? { ...channel, config: {} } : null }
  } catch (e: any) {
    throw createError({ statusCode: 400, message: e?.message || '保存通知渠道失败' })
  }
})
