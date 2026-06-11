import { useDb } from '../../../utils/db'
import { SubtitleService } from '../../../utils/subtitle'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, message: 'Task ID is required' })
  }

  const query = getQuery(event)
  const format = String(query.format || 'srt').toLowerCase() === 'ass' ? 'ass' : 'srt'
  const requestedBilingualLayout = String(query.bilingualLayout || '')
  const requestedOutputMode = String(query.outputMode || '')
  const requestedStylePreset = String(query.subtitleStylePreset || '')
  const db = useDb()
  const task = db.prepare('SELECT output_mode, subtitle_style_preset, bilingual_layout FROM tasks WHERE task_id = ?').get(id) as any
  const rows = db.prepare(`
    SELECT subtitle_id, start_time, end_time, original_text, translated_text, final_text
    FROM task_review_entries
    WHERE task_id = ?
    ORDER BY CAST(subtitle_id AS INTEGER) ASC, id ASC
  `).all(id) as any[]

  if (!rows.length) {
    return { content: '', count: 0, format }
  }

  const entries = rows.map(row => ({
    id: String(row.subtitle_id),
    startTime: row.start_time,
    endTime: row.end_time,
    text: row.original_text,
    translatedText: row.final_text || row.translated_text || row.original_text
  }))

  const outputMode = (requestedOutputMode || task?.output_mode || 'translated') as any
  const bilingualLayout = (requestedBilingualLayout === 'translated_first' || requestedBilingualLayout === 'original_first') ? requestedBilingualLayout : (task?.bilingual_layout || 'translated_first')

  if (format === 'ass') {
    const content = SubtitleService.buildAssContent(
      entries as any,
      requestedStylePreset || task?.subtitle_style_preset || 'bilingual_simple',
      outputMode,
      bilingualLayout
    )
    return { content, count: rows.length, format }
  }

  const content = rows.map((row, index) => {
    const entry = entries[index]
    const displayText = SubtitleService.getDisplayText(entry, outputMode, bilingualLayout)
      .replace(/__SUBX_FMT_\d+__/g, '')
    return `${index + 1}\n${row.start_time} --> ${row.end_time}\n${displayText}\n`
  }).join('\n')

  return {
    count: rows.length,
    content,
    format
  }
})
