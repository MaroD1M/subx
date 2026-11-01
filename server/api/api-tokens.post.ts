import { requireScope } from '../utils/apiTokens'
import { ApiTokenService } from '../utils/apiTokens'
import { apiTokenCreateSchema, parseBody } from '../utils/validation'

export default defineEventHandler(async (event) => {
  requireScope(event, 'tokens:manage')
  const body = await parseBody(event, apiTokenCreateSchema)
  try {
    return ApiTokenService.create(body)
  } catch (e: any) {
    throw createError({ statusCode: 400, message: e?.message || '创建 API Token 失败' })
  }
})
