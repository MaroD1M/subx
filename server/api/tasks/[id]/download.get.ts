import { useDb } from '../../../utils/db'
import { createReadStream, existsSync } from 'fs'
import { basename } from 'path'

export default defineEventHandler(async (event) => {
    const id = getRouterParam(event, 'id')
    if (!id) {
        throw createError({ statusCode: 400, message: 'Task ID is required' })
    }

    const query = getQuery(event)
    const requestFormat = String(query.format || '').toLowerCase()
    const validFormats = ['srt', 'ass']
    if (requestFormat && !validFormats.includes(requestFormat)) {
        throw createError({ statusCode: 400, message: `Invalid format: ${requestFormat}. Use srt or ass` })
    }

    const db = useDb()
    const row = db.prepare('SELECT * FROM tasks WHERE task_id = ?').get(id) as any
    if (!row) {
        throw createError({ statusCode: 404, message: 'Task not found' })
    }

    if (row.status !== 'done') {
        throw createError({ statusCode: 400, message: `Task is not complete yet (status: ${row.status})` })
    }

    let outputPath = row.output_path
    if (!outputPath) {
        throw createError({ statusCode: 404, message: 'Output path not recorded for this task' })
    }

    if (requestFormat) {
        const altPath = outputPath.replace(/\.(srt|ass)$/, `.${requestFormat}`)
        if (existsSync(altPath)) {
            outputPath = altPath
        } else {
            throw createError({ statusCode: 404, message: `${requestFormat.toUpperCase()} file not found` })
        }
    } else {
        if (!existsSync(outputPath)) {
            throw createError({ statusCode: 404, message: `Output file not found at: ${outputPath}` })
        }
    }

    const fileName = basename(outputPath)

    setHeaders(event, {
        'Content-Type': 'text/plain; charset=utf-8',
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
    })

    return sendStream(event, createReadStream(outputPath))
})
