import { createReadStream } from 'node:fs'
import { extname } from 'node:path'
import { apiError } from '../../utils/apiError'
import { useDb } from '../../utils/db'
import { resolveMediaPath } from '../../utils/mediaRoots'
import { VideoService } from '../../utils/video'
import { renderPreviewFrame } from '../../utils/previewFrame'
import { parseBody, previewFrameSchema } from '../../utils/validation'
import { normalizeSubtitleStyle } from '~~/shared/subtitleStyles'

const VIDEO_EXTENSIONS = new Set([
  '.mkv', '.mp4', '.avi', '.webm', '.ts', '.m2ts', '.mts', '.mov',
  '.flv', '.wmv', '.mpg', '.mpeg', '.m4v', '.vob', '.3gp', '.ogv'
])

const DEFAULT_ORIGINAL_TEXT = 'This is the original subtitle.'
const DEFAULT_TRANSLATED_TEXT = '这是译文示例字幕。'

function srtTimeToMs(value: unknown): number {
  const match = String(value || '').match(/^(\d{2}):(\d{2}):(\d{2})[,.](\d{3})$/)
  if (!match) return 0
  const [, hh, mm, ss, ms] = match
  return Number(hh) * 3600000 + Number(mm) * 60000 + Number(ss) * 1000 + Number(ms)
}

function parseStoredStyle(value: unknown): unknown {
  if (!value) return undefined
  try { return JSON.parse(String(value)) } catch { return undefined }
}

export default defineEventHandler(async (event) => {
  const body = await parseBody(event, previewFrameSchema)
  const db = useDb()

  let filePath = body.filePath
  let rootId = body.rootId
  let task: any = null

  if (body.taskId) {
    task = db.prepare(`
      SELECT file_path, root_id, output_mode, subtitle_style_preset, subtitle_style_json, bilingual_layout
      FROM tasks
      WHERE task_id = ?
    `).get(body.taskId)
    if (!task) throw apiError(404, '任务不存在')
    filePath = task.file_path
    rootId = task.root_id
  }

  if (!filePath) throw apiError(400, '缺少视频文件路径')
  if (!VIDEO_EXTENSIONS.has(extname(String(filePath)).toLowerCase())) {
    throw apiError(400, '当前文件不是视频，无法生成实景预览')
  }

  let media
  try {
    media = await VideoService.probeMedia(filePath, rootId)
  } catch (error: any) {
    throw apiError(400, `无法读取视频信息：${error?.message || error}`)
  }
  if (!media.width || !media.height) {
    throw apiError(400, '无法获取视频分辨率，不能生成实景预览')
  }

  const rows = body.taskId
    ? db.prepare(`
        SELECT start_time, end_time, original_text, translated_text, final_text
        FROM task_review_entries
        WHERE task_id = ?
        ORDER BY sort_order ASC, CAST(subtitle_id AS INTEGER) ASC, id ASC
      `).all(body.taskId) as any[]
    : []

  const requestedMs = body.time == null ? null : Math.round(Number(body.time) * 1000)
  const pickedRow = (() => {
    if (!rows.length) return null
    const target = requestedMs ?? Math.round((srtTimeToMs(rows[0].start_time) + srtTimeToMs(rows[0].end_time)) / 2)
    return rows.find(row => {
      const start = srtTimeToMs(row.start_time)
      const end = srtTimeToMs(row.end_time)
      return target >= start && target <= end
    }) || rows.reduce((best, row) => {
      const start = srtTimeToMs(row.start_time)
      const end = srtTimeToMs(row.end_time)
      const midpoint = (start + end) / 2
      const bestMidpoint = (srtTimeToMs(best.start_time) + srtTimeToMs(best.end_time)) / 2
      return Math.abs(midpoint - target) < Math.abs(bestMidpoint - target) ? row : best
    }, rows[0])
  })()

  const defaultTimeMs = pickedRow
    ? Math.round((srtTimeToMs(pickedRow.start_time) + srtTimeToMs(pickedRow.end_time)) / 2)
    : Math.round(Math.max(0, Math.min(media.duration * 0.1, Math.max(0, media.duration - 0.1))) * 1000)
  const maxTimeMs = Math.max(0, Math.round(Math.max(0, media.duration - 0.05) * 1000))
  const timeMs = Math.min(maxTimeMs, Math.max(0, requestedMs ?? defaultTimeMs))

  const outputMode = (body.outputMode || task?.output_mode || 'translated') as 'translated' | 'bilingual' | 'original'
  const bilingualLayout = (body.bilingualLayout || task?.bilingual_layout || 'translated_first') as 'translated_first' | 'original_first'
  const subtitleStyle = normalizeSubtitleStyle(
    body.subtitleStyle || body.subtitleStylePreset || parseStoredStyle(task?.subtitle_style_json) || task?.subtitle_style_preset || 'bilingual_simple',
    outputMode
  )
  if (subtitleStyle.presetId === 'inherit') {
    throw apiError(400, '“沿用原样式”暂不支持实景预览，请选择具体预设')
  }

  const originalText = String(body.originalText || pickedRow?.original_text || DEFAULT_ORIGINAL_TEXT)
  const translatedText = String(body.translatedText || pickedRow?.final_text || pickedRow?.translated_text || pickedRow?.original_text || DEFAULT_TRANSLATED_TEXT)

  try {
    const result = await renderPreviewFrame({
      inputPath: await resolveMediaPath(String(filePath), rootId),
      time: timeMs / 1000,
      width: media.width,
      height: media.height,
      outputMode,
      bilingualLayout,
      subtitleStyle,
      originalText,
      translatedText
    })

    setHeaders(event, {
      'Content-Type': 'image/png',
      'Cache-Control': 'no-store',
      'X-Preview-Width': String(result.width),
      'X-Preview-Height': String(result.height),
      'X-Preview-Time': String(result.time),
      'X-Preview-Duration': String(media.duration),
      'X-Preview-Cached': result.cached ? '1' : '0'
    })
    return sendStream(event, createReadStream(result.filePath))
  } catch (error: any) {
    throw apiError(500, error?.message || '实景预览生成失败')
  }
})
