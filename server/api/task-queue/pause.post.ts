import { requireScope } from '../../utils/apiTokens'
import { QueueControlService } from '../../utils/queueControl'

export default defineEventHandler((event) => {
  requireScope(event, 'tasks:write')
  const auth = event.context.auth as { name?: string } | undefined
  return { control: QueueControlService.setPaused(true, auth?.name || 'manual') }
})
