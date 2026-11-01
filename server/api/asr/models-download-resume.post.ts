import { ConfigService } from '../../utils/config'
import { requestAsrAdmin } from '../../utils/asr/admin'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const jobId = String(body?.jobId || '').trim()
  if (!jobId) throw createError({ statusCode: 400, message: 'jobId is required' })
  const config = await ConfigService.getConfig(true)
  const form = new FormData()
  if (body?.proxy) form.append('proxy', String(body.proxy).trim())
  return requestAsrAdmin(config, `/models/download/${encodeURIComponent(jobId)}/resume`, {
    method: 'POST',
    body: form
  })
})
