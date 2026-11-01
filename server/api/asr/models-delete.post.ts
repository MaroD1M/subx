import { ConfigService } from '../../utils/config'
import { requestAsrAdmin } from '../../utils/asr/admin'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const model = String(body?.model || '').trim()
  const engine = String(body?.engine || '').trim()
  if (!model) throw createError({ statusCode: 400, message: 'model is required' })
  const config = await ConfigService.getConfig(true)
  const form = new FormData()
  form.append('model', model)
  if (engine) form.append('engine', engine)
  return requestAsrAdmin(config, '/models/delete', {
    method: 'POST',
    body: form
  })
})
