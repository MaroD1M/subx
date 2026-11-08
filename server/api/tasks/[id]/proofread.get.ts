import { requireScope } from '../../../utils/apiTokens'
import { ProofreadingService, type ProofreadKind } from '../../../utils/proofreading'
import { apiError } from '../../../utils/apiError'

export default defineEventHandler(async (event) => {
  requireScope(event, 'tasks:read')
  const id = getRouterParam(event, 'id')
  if (!id) throw apiError(400, 'Task ID is required')
  const kind = String(getQuery(event).kind || 'glossary') as ProofreadKind
  if (!['glossary', 'consistency'].includes(kind)) {
    throw apiError(400, '校对类型不合法')
  }
  try {
    const cached = await ProofreadingService.getCached(id, kind)
    if (!cached) return { ok: true, kind, available: false, terms: [], issues: [] }
    return { ok: true, kind, available: true, ...cached }
  } catch (error: any) {
    if (error?.statusCode) throw error
    const message = String(error?.message || error)
    throw apiError(message.includes('任务不存在') ? 404 : 400, message)
  }
})
