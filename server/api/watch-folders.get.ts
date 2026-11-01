import { requireScope } from '../utils/apiTokens'
import { WatchService } from '../utils/watchService'

export default defineEventHandler(async (event) => {
  requireScope(event, 'automation:read')
  return { folders: await WatchService.listFolders() }
})
