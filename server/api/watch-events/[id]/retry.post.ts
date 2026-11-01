import { requireScope } from '../../../utils/apiTokens'
import { WatchService } from '../../../utils/watchService'

export default defineEventHandler(async (event) => {
  requireScope(event, 'automation:write')
  const id = Number(getRouterParam(event, 'id'))
  if (!Number.isInteger(id) || id <= 0) throw createError({ statusCode: 400, message: '事件 ID 不合法' })
  try {
    await WatchService.retryEvent(id)
    return { success: true }
  } catch (e: any) {
    throw createError({ statusCode: 400, message: e?.message || '重试失败' })
  }
})
