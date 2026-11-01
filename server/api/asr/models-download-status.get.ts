import { ConfigService } from '../../utils/config'
import { requestAsrAdmin } from '../../utils/asr/admin'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const jobId = String(query.jobId || '').trim()
  if (!jobId) {
    throw createError({ statusCode: 400, message: 'jobId is required' })
  }
  const config = await ConfigService.getConfig(true)
  return requestAsrAdmin(config, `/models/download/${encodeURIComponent(jobId)}`, { timeoutMs: 10_000 })
})
