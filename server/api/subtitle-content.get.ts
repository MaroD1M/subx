import { apiError } from '../utils/apiError'
import { SubtitleService, safePath } from '../utils/subtitle'

export default defineEventHandler(async (event) => {
  const { path, rootId } = getQuery(event) as { path: string, rootId?: string }

  if (!path) {
    throw apiError(400, 'Path is required')
  }

  const fullPath = await safePath(path, rootId)

  try {
    const entries = await SubtitleService.parseSubtitle(fullPath)
    return {
      entries: entries.slice(0, 50),
      total: entries.length
    }
  } catch (e: any) {
    console.error('[API] Error reading subtitle content:', e)
    throw apiError(e.statusCode || 500, `Failed to read subtitle content: ${e.message}`)
  }
})
