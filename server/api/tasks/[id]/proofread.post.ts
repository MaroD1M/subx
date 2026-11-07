import { requireScope } from '../../../utils/apiTokens'
import { ProofreadingService, type ProofreadKind } from '../../../utils/proofreading'
import { parseBody, proofreadRequestSchema } from '../../../utils/validation'

export default defineEventHandler(async (event) => {
  requireScope(event, 'tasks:write')
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, message: 'Task ID is required' })
  const body = await parseBody(event, proofreadRequestSchema)
  const kind = String(body?.kind || 'glossary') as ProofreadKind
  if (!['glossary', 'consistency'].includes(kind)) {
    throw createError({ statusCode: 400, message: '校对类型不合法' })
  }
  try {
    return { ok: true, kind, available: true, ...(await ProofreadingService.suggest(id, kind, { force: body?.refresh === true })) }
  } catch (error: any) {
    if (error?.statusCode) throw error
    const message = String(error?.message || error)
    throw createError({ statusCode: message.includes('任务不存在') ? 404 : 400, message })
  }
})
