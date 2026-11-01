import { requireScope } from '../../utils/apiTokens'
import { ApiTokenService } from '../../utils/apiTokens'

export default defineEventHandler((event) => {
  requireScope(event, 'tokens:manage')
  const id = Number(getRouterParam(event, 'id'))
  if (!Number.isInteger(id) || id <= 0) throw createError({ statusCode: 400, message: 'Token ID 不合法' })
  if (!ApiTokenService.revoke(id)) throw createError({ statusCode: 404, message: 'Token 不存在或已撤销' })
  return { success: true }
})
