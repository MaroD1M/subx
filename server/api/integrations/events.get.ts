import { requireScope } from '../../utils/apiTokens'
import { IntegrationService } from '../../utils/integrations'

export default defineEventHandler((event) => {
  requireScope(event, 'automation:read')
  const query = getQuery(event) as { limit?: string }
  return { events: IntegrationService.listEvents(Number(query.limit) || 100) }
})
