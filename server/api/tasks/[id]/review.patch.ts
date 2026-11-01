import { useDb } from '../../../utils/db'
import { parseBody, reviewPatchSchema } from '../../../utils/validation'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, message: 'Task ID is required' })
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
    SET translated_text = ?, final_text = ?, review_status = ?, sort_order = COALESCE(?, sort_order), selected = ?, edited = ?,
      quality_score = CASE WHEN ? THEN NULL ELSE quality_score END,
      quality_issues = CASE WHEN ? THEN '[]' ELSE quality_issues END,
      updated_at = datetime('now')
    WHERE task_id = ? AND subtitle_id = ?
  `)

  for (const entry of entries) {
    const translatedText = String(entry.translatedText || '')
    const finalText = String(entry.finalText || '')
    const reviewStatus = String(entry.reviewStatus || 'edited')
    const selected = entry.selected ? 1 : 0
    const edited = entry.edited ? 1 : 0
    const sortOrder = Number.isFinite(Number(entry.sortOrder)) ? Number(entry.sortOrder) : null
    stmt.run(translatedText, finalText, reviewStatus, sortOrder, selected, edited, edited, edited, id, String(entry.subtitleId))
  }

  return { success: true, updated: entries.length }
})
