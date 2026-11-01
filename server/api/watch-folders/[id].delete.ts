import { requireScope } from '../../utils/apiTokens'
import { WatchService } from '../../utils/watchService'

export default defineEventHandler(async (event) => {
  requireScope(event, 'automation:write')
  const id = Number(getRouterParam(event, 'id'))
  if (!Number.isInteger(id) || id <= 0) throw createError({ statusCode: 400, message: '监控目录 ID 不合法' })
  const deleted = await WatchService.deleteFolder(id)
  if (!deleted) throw createError({ statusCode: 404, message: '监控目录不存在' })
  return { success: true }
})
