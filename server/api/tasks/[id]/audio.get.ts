import { createReadStream, existsSync, mkdirSync } from 'fs'
import { join } from 'path'
import { TaskService } from '../../../utils/task'
import { VideoService } from '../../../utils/video'

function parseSrtTime(value: string): number {
  const match = String(value || '').match(/(\d+):(\d+):(\d+)[,.](\d+)/)
  if (!match) return 0
  return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]) + Number(match[4]) / 1000
}

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, message: 'Task ID is required' })
  const query = getQuery(event) as { start?: string, end?: string }
  const start = Number(query.start)
  const end = Number(query.end)
  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end <= start) {
    throw createError({ statusCode: 400, message: '音频片段范围不合法' })
  }
  const duration = Math.min(30, Math.max(1, end - start))
  const task = TaskService.getTask(id)
  if (!task) throw createError({ statusCode: 404, message: '任务不存在' })

  const tempDir = join(process.cwd(), 'temp')
  if (!existsSync(tempDir)) mkdirSync(tempDir, { recursive: true })
  const cacheKey = `${Math.round(start * 1000)}_${Math.round((start + duration) * 1000)}`
  const outputPath = join(tempDir, `clip_${id}_${cacheKey}.mp3`)

  if (!existsSync(outputPath)) {
    try {
      let audioTrackIndex = task.sourceType === 'asr' ? task.trackIndex : null
      if (audioTrackIndex == null) {
        try {
          const media = await VideoService.probeMedia(task.filePath, task.rootId)
          audioTrackIndex = media.audioTracks.find(track => track.isDefault)?.index ?? media.audioTracks[0]?.index ?? null
        } catch { /* fallback to first audio */ }
      }
      await VideoService.extractAudioClip(task.filePath, start, duration, outputPath, task.rootId, audioTrackIndex)
    } catch (e: any) {
      throw createError({ statusCode: 500, message: `音频片段生成失败：${e?.message || e}` })
    }
  }

  setHeader(event, 'Content-Type', 'audio/mpeg')
  setHeader(event, 'Cache-Control', 'private, max-age=3600')
  setHeader(event, 'Content-Disposition', 'inline')
  return sendStream(event, createReadStream(outputPath))
})
