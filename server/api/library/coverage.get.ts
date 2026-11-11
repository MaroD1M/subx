import { apiError } from '../../utils/apiError'
import { buildLibraryCoverage } from '../../utils/libraryCoverage'

export default defineEventHandler(async (event) => {
  const query = getQuery(event) as {
    rootId?: string
    targetLanguage?: string
    refresh?: string | string[]
  }
  const rootId = String(query.rootId || '').trim()
  if (!rootId) throw apiError(400, '缺少媒体库 ID')

  const targetLanguage = String(query.targetLanguage || '').trim() || undefined
  const refreshValue = Array.isArray(query.refresh) ? query.refresh[0] : query.refresh
  const refresh = refreshValue === '1' || String(refreshValue || '').toLowerCase() === 'true'

  return buildLibraryCoverage(rootId, { targetLanguage, refresh })
})
