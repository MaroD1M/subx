import { useDb } from '../../../utils/db'
import { safePath } from '../../../utils/subtitle'
import { createReadStream, existsSync } from 'fs'
import { basename, join } from 'path'

export default defineEventHandler(async (event) => {
    const id = getRouterParam(event, 'id')
    if (!id) {
        throw createError({ statusCode: 400, message: 'Task ID is required' })
    }

    const db = useDb()
    const row = db.prepare('SELECT * FROM tasks WHERE task_id = ?').get(id) as any
    if (!row) {
        throw createError({ statusCode: 404, message: 'Task not found' })
    }

    const videoDir = process.env.VIDEO_DIR || '/data'

    let sourcePath: string
    if (row.source_type === 'external') {
        sourcePath = safePath(row.file_path)
    } else {
        const baseName = row.file_path.replace(/\.[^.]+$/, '')
        const cleanName = baseName.replace(/\.[a-zA-Z]{2,}(-[a-zA-Z]{2,})?$/, '')
        const possibleExts = ['.srt', '.ass', '.ssa']
        sourcePath = ''
        for (const ext of possibleExts) {
            const candidate = join(videoDir, `${cleanName}${ext}`)
            if (existsSync(candidate)) {
                sourcePath = candidate
                break
            }
        }
        if (!sourcePath) {
            throw createError({ statusCode: 404, message: 'Original subtitle file not found' })
        }
    }

    if (!existsSync(sourcePath)) {
        throw createError({ statusCode: 404, message: `Source file not found: ${sourcePath}` })
    }

    const fileName = basename(sourcePath)

    setHeaders(event, {
        'Content-Type': 'text/plain; charset=utf-8',
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
    })

    return sendStream(event, createReadStream(sourcePath))
})
