import { apiError } from '../../../utils/apiError'
import { QualityService } from '../../../utils/quality'
import { ConfigService } from '../../../utils/config'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) throw apiError(400, 'Task ID is required')
  const config = await ConfigService.getConfig()
  return {
    quality: QualityService.getLatest(id),
    threshold: Number(config.qualityScoreThreshold ?? 0.7)
  }
})
