import { SeriesService } from '../../utils/series'

export default defineEventHandler(async () => {
  return { profiles: SeriesService.listProfiles() }
})
