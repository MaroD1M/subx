import { requireScope } from '../utils/apiTokens'
import { WatchService } from '../utils/watchService'
import { parseBody, watchFolderCreateSchema } from '../utils/validation'

export default defineEventHandler(async (event) => {
  requireScope(event, 'automation:write')
  const body = await parseBody(event, watchFolderCreateSchema)
  try {
    const folder = await WatchService.createFolder(body)
    return { folder }
  } catch (e: any) {
    throw createError({ statusCode: 400, message: e?.message || '创建监控目录失败' })
  }
})
