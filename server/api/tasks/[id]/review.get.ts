import { apiError } from '../../../utils/apiError'
import { toUtcIsoString } from '~~/shared/time'
import { useDb } from '../../../utils/db'
import { SubtitleService } from '../../../utils/subtitle'
import { resolveMediaPath } from '../../../utils/mediaRoots'
import { existsSync } from 'fs'
import { normalizeSubtitleStyle } from '~~/shared/subtitleStyles'

function isSubtitlePath(value: unknown) {
  return /\.(?:srt|ass|ssa|vtt)$/i.test(String(value || ''))
}

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) {
    throw apiError(400, 'Task ID is required')
  }

  const db = useDb()
  const task = db.prepare('SELECT task_id, status, output_mode, subtitle_format, subtitle_style_preset, subtitle_style_json, bilingual_layout, target_lang, file_path, output_path, source_subtitle_path, root_id FROM tasks WHERE task_id = ?').get(id) as any
  if (!task) {
    throw apiError(404, 'Task not found')
  }

  let entries = db.prepare(`
    SELECT id, task_id, subtitle_id, start_time, end_time, original_text, translated_text, final_text, review_status, review_reasons, asr_confidence, quality_score, quality_issues, sort_order, selected, edited, created_at, updated_at
    FROM task_review_entries
    WHERE task_id = ?
    ORDER BY sort_order ASC, CAST(subtitle_id AS INTEGER) ASC, id ASC
  `).all(id) as any[]

  const terminalStatus = ['done', 'error', 'cancelled', 'review'].includes(String(task.status))
  if (terminalStatus && (!entries || entries.length === 0)) {
    const fallbackStatus = task.output_mode === 'original' ? 'accepted_same' : 'needs_review'
    const candidates = (task.output_mode === 'original'
      ? [task.output_path, task.source_subtitle_path, task.file_path]
      : [task.source_subtitle_path, task.file_path])
      .filter((value): value is string => !!value && isSubtitlePath(value))
    for (const candidate of candidates) {
      try {
        const subtitlePath = await resolveMediaPath(candidate, task.root_id)
        if (!existsSync(subtitlePath)) continue
        const parsed = await SubtitleService.parseSubtitle(subtitlePath)
        if (!parsed.length) continue
        const insertStmt = db.prepare(`
          INSERT INTO task_review_entries (task_id, subtitle_id, start_time, end_time, original_text, translated_text, final_text, review_status, review_reasons, asr_confidence, quality_score, quality_issues, sort_order, selected, edited, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, '[]', NULL, NULL, '[]', ?, 0, 0, datetime('now'), datetime('now'))
          ON CONFLICT(task_id, subtitle_id) DO UPDATE SET
            original_text=excluded.original_text,
            sort_order=excluded.sort_order,
            updated_at=datetime('now')
        `)
        parsed.forEach((entry, index) => {
          insertStmt.run(
            task.task_id, entry.id,
            entry.startTime || '', entry.endTime || '',
            entry.text || '', '', entry.text || '', fallbackStatus, index
          )
        })
        entries = db.prepare(`
          SELECT id, task_id, subtitle_id, start_time, end_time, original_text, translated_text, final_text, review_status, review_reasons, asr_confidence, quality_score, quality_issues, sort_order, selected, edited, created_at, updated_at
          FROM task_review_entries
          WHERE task_id = ?
          ORDER BY sort_order ASC, CAST(subtitle_id AS INTEGER) ASC, id ASC
        `).all(id) as any[]
        if (entries.length) break
      } catch {
        db.prepare('DELETE FROM task_review_entries WHERE task_id = ?').run(id)
      }
    }
  }

  const subtitleStyle = (() => {
    try { return task.subtitle_style_json ? normalizeSubtitleStyle(JSON.parse(task.subtitle_style_json), task.output_mode) : undefined } catch { return undefined }
  })()

  return {
    task: {
      taskId: task.task_id,
      status: task.status,
      outputMode: task.output_mode,
      subtitleFormat: task.subtitle_format,
      subtitleStylePreset: subtitleStyle?.presetId || task.subtitle_style_preset,
      subtitleStyle,
      bilingualLayout: task.bilingual_layout || 'translated_first',
      targetLanguage: task.target_lang,
      filePath: task.file_path,
      rootId: task.root_id
    },
    summary: {
      total: entries.length,
      needsReview: entries.filter((entry: any) => ['needs_review', 'fallback_original', 'missing'].includes(entry.review_status)).length,
      edited: entries.filter((entry: any) => entry.edited === 1).length
    },
    entries: entries.map((entry: any) => ({
      id: entry.id,
      taskId: entry.task_id,
      subtitleId: entry.subtitle_id,
      startTime: entry.start_time,
      endTime: entry.end_time,
      originalText: entry.original_text,
      translatedText: entry.translated_text || '',
      finalText: entry.final_text || entry.translated_text || entry.original_text,
      reviewStatus: entry.review_status,
      reviewReasons: JSON.parse(entry.review_reasons || '[]'),
      asrConfidence: entry.asr_confidence ?? null,
      qualityScore: entry.quality_score ?? null,
      qualityIssues: JSON.parse(entry.quality_issues || '[]'),
      sortOrder: Number(entry.sort_order || 0),
      selected: !!entry.selected,
      edited: !!entry.edited,
      createdAt: toUtcIsoString(entry.created_at),
      updatedAt: toUtcIsoString(entry.updated_at)
    }))
  }
})
