import { requireScope } from '../utils/apiTokens'
import { NotificationService } from '../utils/notifications'

export default defineEventHandler(async (event) => {
  requireScope(event, 'automation:read')
  return { channels: await NotificationService.listChannels(true) }
})
