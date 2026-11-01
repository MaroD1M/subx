import { useDb } from '../../../utils/db'
import { safePath } from '../../../utils/subtitle'
import { VideoService } from '../../../utils/video'
import { getMediaRoot } from '../../../utils/mediaRoots'
import { resolveInsideRoot } from '../../../utils/pathSafety'
import { createReadStream, existsSync, mkdirSync, writeFileSync } from 'fs'
import { basename, join, relative } from 'path'
import { SubtitleService } from '../../../utils/subtitle'

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

    const root = await getMediaRoot(row.root_id)
    const videoDir = root.path
    const tempDir = join(process.cwd(), 'temp')
    if (!existsSync(tempDir)) {
        mkdirSync(tempDir, { recursive: true })
    }

    let sourcePath: string
    if (row.source_type === 'asr') {
        const run = db.prepare('SELECT id FROM transcription_runs WHERE task_id = ? ORDER BY id DESC LIMIT 1').get(id) as { id?: number } | undefined
        if (!run?.id) {
            throw createError({ statusCode: 404, message: '该任务没有可下载的 ASR 原始字幕' })
        }
        const segments = db.prepare('SELECT start_ms, end_ms, text FROM asr_segments WHERE run_id = ? ORDER BY start_ms ASC').all(run.id) as Array<{ start_ms: number, end_ms: number, text: string }>
        if (!segments.length) {
            throw createError({ statusCode: 404, message: 'ASR 原始分段为空' })
        }
        const content = segments.map((segment, index) => `${index + 1}\n${SubtitleService.msToSrtTime(segment.start_ms)} --> ${SubtitleService.msToSrtTime(segment.end_ms)}\n${segment.text}\n`).join('\n')
        sourcePath = join(tempDir, `download_asr_${id}.srt`)
        writeFileSync(sourcePath, content, 'utf-8')
    } else if (row.source_type === 'external') {
        sourcePath = await safePath(row.file_path, row.root_id)
    } else {
        // 尝试寻找同名外部文件（保留原有逻辑）
        const baseName = row.file_path.replace(/\.[^.]+$/, '')
        const cleanName = baseName.replace(/\.[a-zA-Z]{2,}(-[a-zA-Z]{2,})?$/, '')
        const possibleExts = ['.srt', '.ass', '.ssa']
        
        let foundPath = ''
        for (const ext of possibleExts) {
            const candidate = join(videoDir, `${cleanName}${ext}`)
            let safeCandidate = ''
            try {
                safeCandidate = await resolveInsideRoot(videoDir, relative(videoDir, candidate), { allowMissing: true })
            } catch {
                continue
            }
            if (existsSync(safeCandidate)) {
                foundPath = safeCandidate
                break
            }
        }

        if (foundPath) {
            sourcePath = foundPath
        } else {
            // 如果找不到外部文件，则从视频中即时提取
            const tempSrtPath = join(tempDir, `download_orig_${id}.srt`)
            try {
                if (!existsSync(tempSrtPath)) {
                    await VideoService.extractSubtitle(row.file_path, row.track_index, tempSrtPath, row.root_id)
                }
                sourcePath = tempSrtPath
            } catch (err: any) {
                throw createError({ statusCode: 500, message: `提取原始字幕失败: ${err.message}` })
            }
        }
    }

    if (!sourcePath || !existsSync(sourcePath)) {
        throw createError({ statusCode: 404, message: '无法找到原始字幕文件' })
    }

    const baseName = basename(row.file_path || 'subtitle').replace(/\.[^.]+$/, '')
    const ext = basename(sourcePath).includes('.') ? basename(sourcePath).split('.').pop() : 'srt'
    const fileName = `${baseName}.original.${ext}`

    setHeaders(event, {
        'Content-Type': 'text/plain; charset=utf-8',
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
    })

    return sendStream(event, createReadStream(sourcePath))
})
