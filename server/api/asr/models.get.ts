import { ConfigService } from '../../utils/config'
import { requestAsrAdmin } from '../../utils/asr/admin'

export default defineEventHandler(async () => {
  const config = await ConfigService.getConfig(true)
  return requestAsrAdmin(config, '/models')
})
