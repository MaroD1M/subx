import { basename, dirname, join } from 'path'
import { useDb } from '../../../utils/db'
import { SubtitleService } from '../../../utils/subtitle'
import { resolveMediaPath } from '../../../utils/mediaRoots'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, message: 'Task ID is required' })
  }

  const db = useDb()
  const task = db.prepare('SELECT * FROM tasks WHERE task_id = ?').get(id) as any
  if (!task) {
    throw createError({ statusCode: 404, message: 'Task not found' })
  }

  const rows = db.prepare(`
    SELECT subtitle_id, start_time, end_time, original_text, translated_text, final_text
    FROM task_review_entries
    WHERE task_id = ?
    ORDER BY CAST(subtitle_id AS INTEGER) ASC, id ASC
  `).all(id) as any[]

  if (!rows.length) {
    throw createError({ statusCode: 400, message: 'No review entries found' })
  }

  const inputPath = await resolveMediaPath(task.file_path, task.root_id)
  const baseName = task.file_path.replace(/\.[^.]+$/, '')
  const cleanName = baseName.replace(/\.[a-zA-Z]{2,}(-[a-zA-Z]{2,})?$/, '')
  const outputExt = 'srt'
  const outputSuffix = task.output_mode === 'original' ? 'original' : task.target_lang
  const outputBaseName = basename(cleanName)
  const outputPath = join(dirname(inputPath), `${outputBaseName}.${outputSuffix}.${outputExt}`)
  const sourceSubtitlePath = task.source_type === 'external' ? await resolveMediaPath(task.file_path, task.root_id) : join(process.cwd(), 'temp', `${id}.srt`)

  const entries = rows.map(row => ({
    id: String(row.subtitle_id),
    startTime: row.start_time,
    endTime: row.end_time,
    text: row.original_text,
    translatedText: row.final_text || row.translated_text || row.original_text
  }))

  const savedPath = await SubtitleService.writeSubtitle(
    entries as any,
    outputPath,
    task.output_mode || 'translated',
    task.subtitle_format || 'srt',
    task.subtitle_style_preset || 'bilingual_simple',
    task.bilingual_layout || 'translated_first',
    sourceSubtitlePath
  )

  db.prepare("UPDATE tasks SET status = 'done', progress = 100, output_path = ?, error = NULL, updated_at = datetime('now') WHERE task_id = ?").run(savedPath, id)
  db.prepare("INSERT INTO task_logs (task_id, step, category, level, message, created_at) VALUES (?, 'exporting', 'export', 'info', ?, datetime('now'))").run(id, '字幕核对完成，已导出最终文件。')

  return { success: true, outputPath: savedPath }
})
