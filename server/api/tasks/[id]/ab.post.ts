import { apiError } from '../../../utils/apiError'
import { requireScope } from '../../../utils/apiTokens'
import { CostService } from '../../../utils/cost'
import { ReviewJobService } from '../../../utils/reviewJobs'
import { TaskService } from '../../../utils/task'
import { parseBody, reviewAbSchema } from '../../../utils/validation'

export default defineEventHandler(async (event) => {
  requireScope(event, 'tasks:write')
  const taskId = getRouterParam(event, 'id')
  if (!taskId) throw apiError(400, 'Task ID is required')
  const body = await parseBody(event, reviewAbSchema)
  const budget = await CostService.checkBudget()
  if (!budget.allowed) throw apiError(429, budget.message || '本月翻译预算已用完')
  const task = TaskService.getTask(taskId)
  if (!['done', 'error', 'review', 'cancelled'].includes(String(task.status))) {
    throw apiError(409, '任务仍在运行，暂时无法生成 A/B 版本')
  }
  const subtitleIds = Array.isArray(body.subtitleIds) ? body.subtitleIds.map(String) : []
  const job = ReviewJobService.create(taskId, subtitleIds, {
    kind: 'ab',
    options: {
      source: body.source || 'primary',
      model: body.model || '',
      label: body.label || ''
    }
  })
  setResponseStatus(event, 202)
  return { job }
})
