import { requireScope } from '../utils/apiTokens'
import { WatchService } from '../utils/watchService'

export default defineEventHandler(async (event) => {
  requireScope(event, 'automation:read')
  const query = getQuery(event) as { limit?: string, folderId?: string, status?: string }
  return {
    events: await WatchService.listEvents({
      limit: Number(query.limit) || 100,
      folderId: Number(query.folderId) || undefined,
      status: query.status ? String(query.status) : undefined
    })
  }
})
