import { apiError } from '../../utils/apiError'
import { ConfigService } from '../../utils/config'
import { requestAsrAdmin } from '../../utils/asr/admin'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const jobId = String(body?.jobId || '').trim()
  if (!jobId) throw apiError(400, 'jobId is required')
  const config = await ConfigService.getConfig(true)
  return requestAsrAdmin(config, `/models/download/${encodeURIComponent(jobId)}/pause`, {
    method: 'POST'
  })
})
