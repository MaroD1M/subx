import { apiError } from '../../utils/apiError'
import { inferSeriesTitle, SeriesService, seriesKeyFromPath } from '../../utils/series'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const rawRootId = Array.isArray(query.rootId) ? query.rootId[0] : query.rootId
  const rawFilePath = Array.isArray(query.filePath) ? query.filePath[0] : query.filePath
  const rootId = rawRootId === undefined || rawRootId === null ? undefined : String(rawRootId).trim()
  const filePath = rawFilePath === undefined || rawFilePath === null ? '' : String(rawFilePath).trim()

  if (!filePath) {
    throw apiError(400, 'filePath is required')
  }

  return {
    seriesKey: seriesKeyFromPath(filePath, rootId),
    inferredTitle: inferSeriesTitle(filePath),
    profile: SeriesService.getProfile(rootId, filePath)
  }
})
