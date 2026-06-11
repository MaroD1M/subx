import { useDb } from '../../../utils/db'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, message: 'Task ID is required' })
  }

  const body = await readBody(event)
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
    SET translated_text = ?, final_text = ?, review_status = ?, selected = ?, edited = ?, updated_at = datetime('now')
    WHERE task_id = ? AND subtitle_id = ?
  `)

  for (const entry of entries) {
    const translatedText = String(entry.translatedText || '')
    const finalText = String(entry.finalText || '')
    const reviewStatus = String(entry.reviewStatus || 'edited')
    const selected = entry.selected ? 1 : 0
    const edited = entry.edited === false ? 0 : 1
    stmt.run(translatedText, finalText, reviewStatus, selected, edited, id, String(entry.subtitleId))
  }

  return { success: true, updated: entries.length }
})
