import { requireScope } from '../utils/apiTokens'
import { testNotificationProxy } from '../utils/notifications'

export default defineEventHandler(async (event) => {
  requireScope(event, 'automation:write')
  const body = await readBody(event).catch(() => null)
  try {
    return await testNotificationProxy(String(body?.proxyUrl || '').trim())
  } catch (e: any) {
    throw createError({ statusCode: 502, message: e?.message || '代理测试失败' })
  }
})
