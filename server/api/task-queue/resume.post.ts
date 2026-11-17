import { requireScope } from '../../utils/apiTokens'
import { QueueControlService } from '../../utils/queueControl'
import { globalTaskQueue } from '../../utils/task'

export default defineEventHandler(async (event) => {
  requireScope(event, 'tasks:write')
  const control = QueueControlService.setPaused(false)
  await globalTaskQueue.wake()
  return { control }
})
