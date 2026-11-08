import { apiError } from '../utils/apiError'
import { requireScope } from '../utils/apiTokens'
import { testNotificationProxy } from '../utils/notificationTransport'

export default defineEventHandler(async (event) => {
  requireScope(event, 'automation:write')
  const body = await readBody(event).catch(() => null)
  try {
    return await testNotificationProxy(String(body?.proxyUrl || '').trim())
  } catch (e: any) {
    throw apiError(502, e?.message || '代理测试失败')
  }
})
