import { apiError } from '../../../utils/apiError'
import { existsSync } from 'fs'
import { dirname, join } from 'path'
import { useDb } from '../../../utils/db'
import { ConfigService } from '../../../utils/config'
import { SubtitleService } from '../../../utils/subtitle'
import { getMediaRoot, resolveMediaPath } from '../../../utils/mediaRoots'
import { deriveOutputBaseName, isSafeOutputSuffix } from '../../../utils/outputNaming'
import { isPathInside } from '../../../utils/pathSafety'
import { acquireOutputLocks } from '../../../utils/outputLock'
import { parseBody, reviewExportSchema } from '../../../utils/validation'
import { TaskService } from '../../../utils/task'
import { normalizeSubtitleStyle } from '~~/shared/subtitleStyles'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) {
    throw apiError(400, 'Task ID is required')
  }

  const body = await parseBody(event, reviewExportSchema)
  const db = useDb()
  const task = db.prepare('SELECT * FROM tasks WHERE task_id = ?').get(id) as any
  if (!task) {
    throw apiError(404, 'Task not found')
  }

  const rows = db.prepare(`
    SELECT subtitle_id, start_time, end_time, original_text, translated_text, final_text
    FROM task_review_entries
    WHERE task_id = ?
    ORDER BY sort_order ASC, CAST(subtitle_id AS INTEGER) ASC, id ASC
  `).all(id) as any[]

  if (!rows.length) {
    throw apiError(400, 'No review entries found')
  }

  const config = await ConfigService.getConfig()
  const inputPath = await resolveMediaPath(task.file_path, task.root_id)
  const root = await getMediaRoot(task.root_id)
  const subtitleFormat = body.subtitleFormat || (String(task.subtitle_format || 'srt').toLowerCase() === 'ass' ? 'ass' : 'srt')
  const requestedOutputMode = String(body.outputMode || task.output_mode || 'translated')
  const storedStyle = (() => {
    try { return task.subtitle_style_json ? JSON.parse(task.subtitle_style_json) : undefined } catch { return undefined }
  })()
  const requestedStyle = normalizeSubtitleStyle(body.subtitleStyle || body.subtitleStylePreset || storedStyle || task.subtitle_style_preset || 'bilingual_simple', requestedOutputMode)
  const outputSuffix = requestedOutputMode === 'original' ? 'original' : String(task.target_lang || '')
  if (!['srt', 'ass'].includes(subtitleFormat) || !isSafeOutputSuffix(outputSuffix)) {
    throw apiError(400, '导出格式或目标语言不合法')
  }

  const outputBaseName = deriveOutputBaseName(task.file_path, task.source_type)
  const embyCompatible = config.embyCompatibleOutput === true && task.source_type !== 'external'
  const outputPath = embyCompatible
    ? join(dirname(inputPath), `${outputBaseName}.${subtitleFormat}`)
    : join(dirname(inputPath), `${outputBaseName}.${outputSuffix}.${subtitleFormat}`)
  if (outputPath === inputPath) {
    throw apiError(400, '输出路径与源文件冲突，请更改输出设置')
  }
  if (!isPathInside(root.path, outputPath)) {
    throw apiError(400, '输出路径超出媒体库范围')
  }

  const sourceSubtitlePath = task.source_type === 'external'
    ? await resolveMediaPath(String(task.source_subtitle_path || task.file_path), task.root_id)
    : (existsSync(join(process.cwd(), 'temp', `${id}.srt`)) ? join(process.cwd(), 'temp', `${id}.srt`) : '')

  const entries = rows.map(row => ({
    id: String(row.subtitle_id),
    startTime: row.start_time,
    endTime: row.end_time,
    text: row.original_text,
    translatedText: row.final_text || row.translated_text || row.original_text
  }))

  const releaseOutputLock = acquireOutputLocks([outputPath])
  try {
    const savedPath = await SubtitleService.writeSubtitle(
      entries as any,
      outputPath,
      requestedOutputMode as any,
      subtitleFormat,
      requestedStyle.presetId,
      body.bilingualLayout || task.bilingual_layout || 'translated_first',
      sourceSubtitlePath,
      requestedStyle
    )

    db.prepare(`
      UPDATE tasks
      SET output_path = ?, subtitle_format = ?, output_mode = ?, subtitle_style_preset = ?,
          subtitle_style_json = ?, bilingual_layout = ?, updated_at = datetime('now')
      WHERE task_id = ?
    `).run(
      savedPath,
      subtitleFormat,
      requestedOutputMode,
      requestedStyle.presetId,
      JSON.stringify(requestedStyle),
      body.bilingualLayout || task.bilingual_layout || 'translated_first',
      id
    )
    await TaskService.updateStatus(id, 'done', 100, {
      error: null,
      stepProgress: 100,
      stepMessage: '核对导出完成',
      log: '字幕核对完成，已导出最终文件。'
    })

    return { success: true, outputPath: savedPath }
  } finally {
    releaseOutputLock()
  }
})
