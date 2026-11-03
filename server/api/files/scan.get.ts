import { scanMediaFolder } from '../../utils/fileScan'

export default defineEventHandler(async (event) => {
  const { rootId, path } = getQuery(event) as { rootId?: string, path?: string }
  if (!rootId) {
    throw createError({ statusCode: 400, message: '缺少媒体库 ID' })
  }
  return scanMediaFolder(rootId, path || '')
})
