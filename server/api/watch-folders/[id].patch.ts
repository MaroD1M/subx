import { apiError } from '../../utils/apiError'
import { requireScope } from '../../utils/apiTokens'
import { WatchService } from '../../utils/watchService'
import { parseBody, watchFolderUpdateSchema } from '../../utils/validation'

export default defineEventHandler(async (event) => {
  requireScope(event, 'automation:write')
  const id = Number(getRouterParam(event, 'id'))
  if (!Number.isInteger(id) || id <= 0) throw apiError(400, '监控目录 ID 不合法')
  const body = await parseBody(event, watchFolderUpdateSchema)
  try {
    return { folder: await WatchService.updateFolder(id, body) }
  } catch (e: any) {
    throw apiError(400, e?.message || '更新监控目录失败')
  }
})
