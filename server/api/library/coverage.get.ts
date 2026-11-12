import { apiError } from '../../utils/apiError'
import { ConfigService } from '../../utils/config'
import { getCachedLibraryCoverage, scanLibraryCoverage } from '../../utils/libraryCoverage'
import { getMediaRoot } from '../../utils/mediaRoots'

export default defineEventHandler(async (event) => {
  const query = getQuery(event) as {
    rootId?: string
    targetLanguage?: string
    refresh?: string | string[]
    includeEmbedded?: string | string[]
  }
  const rootId = String(query.rootId || '').trim()
  if (!rootId) throw apiError(400, '缺少媒体库 ID')

  const targetLanguage = String(query.targetLanguage || '').trim() || undefined
  const refreshValue = Array.isArray(query.refresh) ? query.refresh[0] : query.refresh
  const refresh = refreshValue === '1' || String(refreshValue || '').toLowerCase() === 'true'
  const includeEmbeddedValue = Array.isArray(query.includeEmbedded)
    ? query.includeEmbedded[0]
    : query.includeEmbedded
  const includeEmbedded = !(
    includeEmbeddedValue === '0'
    || String(includeEmbeddedValue || '').toLowerCase() === 'false'
  )

  if (refresh) {
    return scanLibraryCoverage(rootId, { targetLanguage, refresh: true, includeEmbedded })
  }

  const cached = await getCachedLibraryCoverage(rootId, { targetLanguage, includeEmbedded })
  if (cached) return cached

  const resolvedLanguage = targetLanguage
    || String((await ConfigService.getConfig()).targetLanguage || 'zh-CN').trim()
    || 'zh-CN'
  let rootName = '默认媒体库'
  try {
    rootName = (await getMediaRoot(rootId)).name
  } catch { /* keep fallback name */ }

  return {
    rootId,
    rootName,
    targetLanguage: resolvedLanguage,
    includeEmbedded,
    scanned: 0,
    truncated: false,
    cachedAt: null,
    hasCache: false,
    summary: { total: 0, done: 0, review: 0, processing: 0, failed: 0, missing: 0 },
    series: [],
    files: []
  }
})
