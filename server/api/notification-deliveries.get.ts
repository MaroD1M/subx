import { requireScope } from '../utils/apiTokens'
import { WatchService } from '../utils/watchService'

export default defineEventHandler((event) => {
  requireScope(event, 'automation:read')
  const query = getQuery(event) as { limit?: string }
  return { deliveries: WatchService.listDeliveries(Number(query.limit) || 100) }
})
