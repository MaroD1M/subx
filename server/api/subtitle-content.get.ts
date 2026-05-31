import { SubtitleService, safePath } from '../utils/subtitle'

export default defineEventHandler(async (event) => {
    const { path } = getQuery(event) as { path: string }

    if (!path) {
        throw createError({ statusCode: 400, message: 'Path is required' })
    }

    const fullPath = safePath(path)

    try {
        const entries = await SubtitleService.parseSubtitle(fullPath)
        return { 
            entries: entries.slice(0, 50),
            total: entries.length
        }
    } catch (e: any) {
        console.error('[API] Error reading subtitle content:', e)
        throw createError({
            statusCode: e.statusCode || 500,
            message: `Failed to read subtitle content: ${e.message}`
        })
    }
})
