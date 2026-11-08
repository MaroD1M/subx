import { apiError } from '../../utils/apiError'
import { scanMediaFolder } from '../../utils/fileScan'

export default defineEventHandler(async (event) => {
  const { rootId, path } = getQuery(event) as { rootId?: string, path?: string }
  if (!rootId) {
    throw apiError(400, '缺少媒体库 ID')
  }
  return scanMediaFolder(rootId, path || '')
})
