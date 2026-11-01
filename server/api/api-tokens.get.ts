import { requireScope } from '../utils/apiTokens'
import { ApiTokenService } from '../utils/apiTokens'

export default defineEventHandler((event) => {
  requireScope(event, 'tokens:manage')
  return { tokens: ApiTokenService.list() }
})
