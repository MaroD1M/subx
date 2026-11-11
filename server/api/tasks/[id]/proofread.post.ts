import { requireScope } from '../../../utils/apiTokens'
import { ProofreadingService, type ProofreadKind } from '../../../utils/proofreading'
import { parseBody, proofreadRequestSchema } from '../../../utils/validation'
import { apiError } from '../../../utils/apiError'
import { CostService } from '../../../utils/cost'

export default defineEventHandler(async (event) => {
  requireScope(event, 'tasks:write')
  const id = getRouterParam(event, 'id')
  if (!id) throw apiError(400, 'Task ID is required')
  const budget = await CostService.checkBudget()
  if (!budget.allowed) throw apiError(429, budget.message || '本月翻译预算已用完')
  const body = await parseBody(event, proofreadRequestSchema)
  const kind = String(body?.kind || 'glossary') as ProofreadKind
  if (!['glossary', 'consistency'].includes(kind)) {
    throw apiError(400, '校对类型不合法')
  }
  try {
    const result = await ProofreadingService.suggest(id, kind, { force: body?.refresh === true })
    await CostService.recordTaskCost(id)
    return { ok: true, kind, available: true, ...result }
  } catch (error: any) {
    if (error?.statusCode) throw error
    const message = String(error?.message || error)
    throw apiError(message.includes('任务不存在') ? 404 : 400, message)
  }
})
