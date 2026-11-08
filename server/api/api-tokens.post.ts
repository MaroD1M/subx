import { apiError } from '../utils/apiError'
import { getAuthContext, requireScope } from '../utils/apiTokens'
import { ApiTokenService } from '../utils/apiTokens'
import { apiTokenCreateSchema, parseBody } from '../utils/validation'

export default defineEventHandler(async (event) => {
  requireScope(event, 'tokens:manage')
  const body = await parseBody(event, apiTokenCreateSchema)
  try {
    return ApiTokenService.create(body, getAuthContext(event))
  } catch (e: any) {
    throw apiError(400, e?.message || '创建 API Token 失败')
  }
})
