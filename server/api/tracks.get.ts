import { VideoService } from '../utils/video'
import { safePath } from '../utils/subtitle'

export default defineEventHandler(async (event) => {
  const { path, rootId } = getQuery(event) as { path: string, rootId?: string }

  if (!path) {
    throw createError({ statusCode: 400, message: 'Path is required' })
  }

  await safePath(path, rootId)

  try {
    const tracks = await VideoService.probeTracks(path, rootId)
    return { tracks }
  } catch (e: any) {
    console.error('[API] Error probing tracks:', {
      path,
      rootId,
      error: e.message,
      stack: e.stack
    })
    throw createError({
      statusCode: e.statusCode || 500,
      statusMessage: 'Internal Server Error',
      message: `Failed to probe tracks: ${e.message}`
    })
  }
})
