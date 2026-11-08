import { apiError } from '../utils/apiError'
import { VideoService } from '../utils/video'
import { safePath } from '../utils/subtitle'

export default defineEventHandler(async (event) => {
  const { path, rootId } = getQuery(event) as { path: string, rootId?: string }

  if (!path) {
    throw apiError(400, 'Path is required')
  }

  await safePath(path, rootId)

  try {
    const media = await VideoService.probeMedia(path, rootId)
    return {
      tracks: media.subtitleTracks,
      audioTracks: media.audioTracks,
      duration: media.duration
    }
  } catch (e: any) {
    console.error('[API] Error probing tracks:', {
      path,
      rootId,
      error: e.message,
      stack: e.stack
    })
    throw apiError(e.statusCode || 500, `Failed to probe tracks: ${e.message}`)
  }
})
