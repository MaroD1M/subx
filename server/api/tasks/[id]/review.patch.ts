import { apiError } from '../../../utils/apiError'
import { useDb } from '../../../utils/db'
import { parseBody, reviewPatchSchema } from '../../../utils/validation'

function parseReviewTime(value: unknown): number | null {
  const match = String(value || '').trim().match(/^(\d{1,3}):(\d{2}):(\d{2})[,.](\d{1,3})$/)
  if (!match) return null
  const minutes = Number(match[2])
  const seconds = Number(match[3])
  if (minutes > 59 || seconds > 59) return null
  const milliseconds = Number(String(match[4]).padEnd(3, '0').slice(0, 3))
  return Number(match[1]) * 3600 + minutes * 60 + seconds + milliseconds / 1000
}

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) {
    throw apiError(400, 'Task ID is required')
  }

  const body = await parseBody(event, reviewPatchSchema)
  const db = useDb()
  const entries = Array.isArray(body?.entries) ? body.entries : []
  const nextBilingualLayout = body?.bilingualLayout ? String(body.bilingualLayout) : ''

  if (nextBilingualLayout === 'translated_first' || nextBilingualLayout === 'original_first') {
    db.prepare(`
      UPDATE tasks
      SET bilingual_layout = ?, updated_at = datetime('now')
      WHERE task_id = ?
    `).run(nextBilingualLayout, id)
  }

  if (!entries.length) {
    return { success: true, updated: 0 }
  }

  const stmt = db.prepare(`
    UPDATE task_review_entries
    SET translated_text = ?, final_text = ?, review_status = ?,
      start_time = COALESCE(?, start_time), end_time = COALESCE(?, end_time),
      sort_order = COALESCE(?, sort_order), selected = COALESCE(?, selected), edited = ?,
      quality_score = CASE WHEN ? THEN NULL ELSE quality_score END,
      quality_issues = CASE WHEN ? THEN '[]' ELSE quality_issues END,
      updated_at = datetime('now')
    WHERE task_id = ? AND subtitle_id = ?
  `)

  for (const entry of entries) {
    const translatedText = String(entry.translatedText || '')
    const finalText = String(entry.finalText || '')
    const reviewStatus = String(entry.reviewStatus || 'edited')
    const startTime = entry.startTime === undefined ? null : String(entry.startTime)
    const endTime = entry.endTime === undefined ? null : String(entry.endTime)
    if (startTime !== null && parseReviewTime(startTime) == null) {
      throw apiError(400, '字幕开始时间不合法')
    }
    if (endTime !== null && parseReviewTime(endTime) == null) {
      throw apiError(400, '字幕结束时间不合法')
    }
    if (startTime !== null && endTime !== null && parseReviewTime(endTime)! <= parseReviewTime(startTime)!) {
      throw apiError(400, '字幕开始/结束时间不合法')
    }
    const selected = entry.selected === undefined ? null : (entry.selected ? 1 : 0)
    const edited = entry.edited ? 1 : 0
    const sortOrder = Number.isFinite(Number(entry.sortOrder)) ? Number(entry.sortOrder) : null
    stmt.run(translatedText, finalText, reviewStatus, startTime, endTime, sortOrder, selected, edited, edited, edited, id, String(entry.subtitleId))
  }

  return { success: true, updated: entries.length }
})
