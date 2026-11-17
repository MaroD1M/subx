import { apiError } from '../../../utils/apiError'
import { requireScope } from '../../../utils/apiTokens'
import { ReviewVersionService } from '../../../utils/reviewVersions'
import { parseBody, reviewVersionCreateSchema } from '../../../utils/validation'

export default defineEventHandler(async (event) => {
  requireScope(event, 'tasks:write')
  const taskId = getRouterParam(event, 'id')
  if (!taskId) throw apiError(400, 'Task ID is required')
  const body = await parseBody(event, reviewVersionCreateSchema)
  const auth = event.context.auth as { name?: string } | undefined
  const version = ReviewVersionService.snapshot(taskId, {
    kind: 'manual',
    label: body.label || '手动版本',
    note: body.note || '',
    source: 'user',
    createdBy: auth?.name || ''
  })
  if (!version) throw apiError(400, '当前任务没有可保存的字幕条目')
  return { version }
})
