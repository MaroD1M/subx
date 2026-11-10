import { apiError } from '../../../utils/apiError'
import { useDb } from '../../../utils/db'
import { ReviewJobService } from '../../../utils/reviewJobs'
import { runReviewRetranslate } from '../../../utils/reviewRetranslate'
import { parseBody, reviewRetranslateSchema } from '../../../utils/validation'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) {
    throw apiError(400, 'Task ID is required')
  }

  const body = await parseBody(event, reviewRetranslateSchema)
  const subtitleIds = Array.isArray(body?.subtitleIds) ? body.subtitleIds.map((value: any) => String(value)) : []
  if (!subtitleIds.length) {
    throw apiError(400, 'subtitleIds are required')
  }

  const db = useDb()
  const task = db.prepare('SELECT task_id, status FROM tasks WHERE task_id = ?').get(id) as { task_id?: string, status?: string } | undefined
  if (!task) {
    throw apiError(404, 'Task not found')
  }
  if (!['done', 'error', 'review', 'cancelled'].includes(String(task.status))) {
    throw apiError(409, '任务仍在运行，暂时无法重新翻译')
  }

  const query = getQuery(event) as { sync?: string }
  if (String(query.sync || '') === '1') {
    const result = await runReviewRetranslate({ taskId: id, subtitleIds })
    return { success: true, ...result }
  }

  const job = ReviewJobService.create(id, subtitleIds)
  setResponseStatus(event, 202)
  return { success: true, job }
})
