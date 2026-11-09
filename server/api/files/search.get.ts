import { apiError } from '../../utils/apiError'
import { searchMediaFiles } from '../../utils/fileScan'

export default defineEventHandler(async (event) => {
  const query = getQuery(event) as { rootId?: string, q?: string, limit?: string }
  const rootId = String(query.rootId || '').trim()
  const keyword = String(query.q || '').trim()
  if (!rootId) throw apiError(400, '缺少媒体库 ID')
  if (keyword.length < 2) throw apiError(400, '搜索关键词至少需要 2 个字符')
  return searchMediaFiles(rootId, keyword, Number(query.limit) || 200)
})
