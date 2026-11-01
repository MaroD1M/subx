import { ConfigService } from '../../utils/config'
import { requestAsrAdmin } from '../../utils/asr/admin'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const config = await ConfigService.getConfig(true)

  const form = new FormData()
  form.append('model', String(body?.model || config.asrModel || 'small').trim())
  form.append('engine', String(body?.engine || config.asrEngine || 'auto').trim())
  if (body?.proxy) form.append('proxy', String(body.proxy).trim())
  if (body?.force) form.append('force', 'true')

  return requestAsrAdmin(config, '/models/download', {
    method: 'POST',
    body: form,
    timeoutMs: 60_000
  })
})
