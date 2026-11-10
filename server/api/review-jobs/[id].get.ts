import { apiError } from '../../utils/apiError'
import { ReviewJobService } from '../../utils/reviewJobs'

export default defineEventHandler((event) => {
  const id = getRouterParam(event, 'id')
  if (!id) throw apiError(400, 'Job ID is required')
  const job = ReviewJobService.get(id)
  if (!job) throw apiError(404, '重译任务不存在')
  return { job }
})
