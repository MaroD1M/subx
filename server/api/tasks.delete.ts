import { useDb } from '../utils/db'

export default defineEventHandler(async () => {
    const db = useDb()
    try {
        const stmt = db.prepare(`DELETE FROM tasks WHERE status IN ('done', 'error', 'review', 'cancelled')`)
        const info = stmt.run()

        db.prepare(`DELETE FROM task_logs WHERE task_id NOT IN (SELECT task_id FROM tasks)`).run()
        db.prepare(`DELETE FROM task_review_entries WHERE task_id NOT IN (SELECT task_id FROM tasks)`).run()
        db.prepare(`DELETE FROM task_responses WHERE task_id NOT IN (SELECT task_id FROM tasks)`).run()
        db.prepare(`DELETE FROM translations_cache`).run()

        return { success: true, deletedCount: info.changes }
    } catch (e: any) {
        console.error('Failed to clear history:', e)
        throw createError({ statusCode: 500, message: 'Failed to clear task history' })
    }
})
