import { requireScope } from '../../../utils/apiTokens'
import { ProofreadingService, type ProofreadKind } from '../../../utils/proofreading'

export default defineEventHandler(async (event) => {
  requireScope(event, 'tasks:write')
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, message: 'Task ID is required' })
  const body = await readBody(event).catch(() => ({}))
  const kind = String(body?.kind || 'glossary') as ProofreadKind
  if (!['glossary', 'consistency'].includes(kind)) {
    throw createError({ statusCode: 400, message: '校对类型不合法' })
  }
  try {
    return { ok: true, kind, ...(await ProofreadingService.suggest(id, kind)) }
  } catch (error: any) {
    if (error?.statusCode) throw error
    throw createError({ statusCode: 400, message: String(error?.message || error) })
  }
})
