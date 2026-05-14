import { VideoService } from '../utils/video'
import { safePath } from '../utils/subtitle'

export default defineEventHandler(async (event) => {
    const { path } = getQuery(event) as { path: string }

    if (!path) {
        throw createError({ statusCode: 400, message: 'Path is required' })
    }

    safePath(path)

    try {
        const tracks = await VideoService.probeTracks(path)
        return { tracks }
    } catch (e: any) {
        console.error('[API] Error probing tracks:', {
            path,
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
