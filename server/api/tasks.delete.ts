import { useDb } from '../utils/db'
import { removeTaskArtifacts } from '../utils/task'

export default defineEventHandler(async () => {
    const db = useDb()
    try {
        const rows = db.prepare("SELECT task_id FROM tasks WHERE status IN ('done', 'error', 'review', 'cancelled')").all() as Array<{ task_id: string }>
        const stmt = db.prepare(`DELETE FROM tasks WHERE status IN ('done', 'error', 'review', 'cancelled')`)
        const info = stmt.run()

        db.prepare(`DELETE FROM task_jobs WHERE task_id NOT IN (SELECT task_id FROM tasks)`).run()
        db.prepare(`DELETE FROM task_logs WHERE task_id NOT IN (SELECT task_id FROM tasks)`).run()
        db.prepare(`DELETE FROM task_review_entries WHERE task_id NOT IN (SELECT task_id FROM tasks)`).run()
        db.prepare(`DELETE FROM task_responses WHERE task_id NOT IN (SELECT task_id FROM tasks)`).run()
        try { db.prepare(`DELETE FROM translation_quality_entries WHERE task_id NOT IN (SELECT task_id FROM tasks)`).run() } catch { /* old schema */ }
        try { db.prepare(`DELETE FROM translation_quality_runs WHERE task_id NOT IN (SELECT task_id FROM tasks)`).run() } catch { /* old schema */ }
        try { db.prepare(`DELETE FROM asr_segments WHERE run_id IN (SELECT id FROM transcription_runs WHERE task_id NOT IN (SELECT task_id FROM tasks))`).run() } catch { /* old schema */ }
        try { db.prepare(`DELETE FROM transcription_runs WHERE task_id NOT IN (SELECT task_id FROM tasks)`).run() } catch { /* old schema */ }
        db.prepare(`DELETE FROM translations_cache`).run()
        for (const row of rows) removeTaskArtifacts(row.task_id)

        return { success: true, deletedCount: info.changes }
    } catch (e: any) {
        console.error('Failed to clear history:', e)
        throw createError({ statusCode: 500, message: 'Failed to clear task history' })
    }
})
