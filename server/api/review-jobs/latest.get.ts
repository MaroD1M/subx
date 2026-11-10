import { apiError } from '../../utils/apiError'
import { ReviewJobService } from '../../utils/reviewJobs'

export default defineEventHandler((event) => {
  const query = getQuery(event) as { taskId?: string }
  const taskId = String(query.taskId || '').trim()
  if (!taskId) throw apiError(400, 'taskId is required')
  return { job: ReviewJobService.latestForTask(taskId) }
})
