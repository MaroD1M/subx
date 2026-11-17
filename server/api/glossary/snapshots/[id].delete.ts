import { apiError } from '../../../utils/apiError'
import { requireScope } from '../../../utils/apiTokens'
import { GlossaryService } from '../../../utils/glossary'

export default defineEventHandler((event) => {
  requireScope(event, 'glossary:write')
  const id = Number(getRouterParam(event, 'id'))
  if (!Number.isInteger(id) || id <= 0) throw apiError(400, '快照 ID 不合法')
  if (!GlossaryService.deleteSnapshot(id)) throw apiError(404, '快照不存在')
  return { success: true }
})
