import { useDb } from '../../../utils/db'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, message: 'Task ID is required' })
  }

  const body = await readBody(event)
  const db = useDb()
  const entries = Array.isArray(body?.entries) ? body.entries : []

  if (!entries.length) {
    return { success: true, updated: 0 }
  }

  const stmt = db.prepare(`
    UPDATE task_review_entries
    SET final_text = ?, review_status = ?, selected = ?, edited = ?, updated_at = datetime('now')
    WHERE task_id = ? AND subtitle_id = ?
  `)

  for (const entry of entries) {
    const finalText = String(entry.finalText || '')
    const reviewStatus = String(entry.reviewStatus || 'edited')
    const selected = entry.selected ? 1 : 0
    const edited = entry.edited === false ? 0 : 1
    stmt.run(finalText, reviewStatus, selected, edited, id, String(entry.subtitleId))
  }

  return { success: true, updated: entries.length }
})
