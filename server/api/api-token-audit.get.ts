import { ApiTokenService, requireScope } from '../utils/apiTokens'

export default defineEventHandler((event) => {
  requireScope(event, 'tokens:manage')
  const query = getQuery(event) as { limit?: string }
  return { logs: ApiTokenService.listAudit(Number(query.limit) || 100) }
})
