import { apiError } from '../../../utils/apiError'
import { requireScope } from '../../../utils/apiTokens'
import { TaskService } from '../../../utils/task'
import { VideoService } from '../../../utils/video'
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'fs'
import { join } from 'path'

const SAMPLE_RATE = 8000
const MAX_WINDOW_SECONDS = 900

function parseSeconds(value: unknown, fallback: number) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

export default defineEventHandler(async (event) => {
  requireScope(event, 'tasks:read')
  const id = getRouterParam(event, 'id')
  if (!id) throw apiError(400, '任务 ID 不能为空')
  const query = getQuery(event) as { start?: string, end?: string, buckets?: string }
  const task = TaskService.getTask(id)
  if (!task) throw apiError(404, '任务不存在')

  let start = Math.max(0, parseSeconds(query.start, 0))
  let end = Math.max(start + 1, parseSeconds(query.end, start + 300))
  if (end - start > MAX_WINDOW_SECONDS) end = start + MAX_WINDOW_SECONDS
  const buckets = Math.max(100, Math.min(2000, Math.floor(parseSeconds(query.buckets, 900))))

  const tempRoot = join(process.cwd(), 'temp', 'waveform')
  if (!existsSync(tempRoot)) mkdirSync(tempRoot, { recursive: true })
  const cacheKey = `${id}_${Math.round(start * 1000)}_${Math.round(end * 1000)}_${buckets}`
  const cachePath = join(tempRoot, `${cacheKey}.json`)
  if (existsSync(cachePath) && Date.now() - statSync(cachePath).mtimeMs < 7 * 24 * 60 * 60 * 1000) {
    try {
      return JSON.parse(readFileSync(cachePath, 'utf-8'))
    } catch { /* regenerate */ }
  }

  let audioTrackIndex: number | null = task.sourceType === 'asr' ? (task.trackIndex ?? 0) : null
  if (audioTrackIndex == null) {
    try {
      const media = await VideoService.probeMedia(task.filePath, task.rootId)
      audioTrackIndex = media.audioTracks.find(track => track.isDefault)?.index ?? media.audioTracks[0]?.index ?? null
    } catch { /* fallback to first audio */ }
  }

  const pcmPath = join(tempRoot, `${cacheKey}.pcm`)
  try {
    await VideoService.extractAudioPcm(task.filePath, start, end - start, pcmPath, task.rootId, audioTrackIndex)
    const buffer = readFileSync(pcmPath)
    const samples = Math.floor(buffer.length / 2)
    const peaks: Array<[number, number]> = []
    if (samples <= 0) throw new Error('音频区间为空')
    for (let bucket = 0; bucket < buckets; bucket++) {
      const from = Math.floor((bucket * samples) / buckets)
      const to = Math.max(from + 1, Math.floor(((bucket + 1) * samples) / buckets))
      let min = 0
      let max = 0
      for (let index = from; index < to; index++) {
        const value = buffer.readInt16LE(index * 2) / 32768
        if (value < min) min = value
        if (value > max) max = value
      }
      peaks.push([Math.max(-1, Math.min(1, min)), Math.max(-1, Math.min(1, max))])
    }
    const payload = {
      start,
      end,
      duration: end - start,
      sampleRate: SAMPLE_RATE,
      buckets: peaks
    }
    try { rmSync(pcmPath, { force: true }) } catch { /* ignore temp cleanup */ }
    try { writeFileSync(cachePath, JSON.stringify(payload)) } catch { /* cache is best effort */ }
    return payload
  } catch (error: any) {
    try { rmSync(pcmPath, { force: true }) } catch { /* ignore */ }
    throw apiError(500, `波形生成失败：${error?.message || error}`)
  }
})
