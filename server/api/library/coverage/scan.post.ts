import { apiError } from '../../../utils/apiError'
import { scanLibraryCoverage } from '../../../utils/libraryCoverage'
import { getMediaRoot } from '../../../utils/mediaRoots'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const rootId = String(body?.rootId || '').trim()
  if (!rootId) throw apiError(400, '缺少媒体库 ID')
  await getMediaRoot(rootId)

  const targetLanguage = String(body?.targetLanguage || '').trim() || undefined
  const includeEmbedded = body?.includeEmbedded !== false

  return scanLibraryCoverage(rootId, { targetLanguage, includeEmbedded, refresh: true })
})
