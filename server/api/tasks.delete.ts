import { apiError } from '../utils/apiError'
import { useDb } from '../utils/db'
import { removeTaskArtifacts } from '../utils/task'

export default defineEventHandler(async () => {
    const db = useDb()
    try {
        const rows = db.prepare("SELECT task_id, asr_checkpoint_key FROM tasks WHERE status IN ('done', 'error', 'review', 'cancelled')").all() as Array<{ task_id: string, asr_checkpoint_key?: string }>
        let deletedCount = 0
        db.exec('BEGIN')
        try {
            const stmt = db.prepare(`DELETE FROM tasks WHERE status IN ('done', 'error', 'review', 'cancelled')`)
            const info = stmt.run()
            deletedCount = Number(info.changes || 0)
            try {
                const keys = rows.map(row => row.asr_checkpoint_key).filter(Boolean)
                for (const key of keys) db.prepare('DELETE FROM asr_checkpoints WHERE checkpoint_key = ?').run(String(key))
            } catch { /* old schema */ }

            db.prepare(`DELETE FROM task_jobs WHERE task_id NOT IN (SELECT task_id FROM tasks)`).run()
            db.prepare(`DELETE FROM task_logs WHERE task_id NOT IN (SELECT task_id FROM tasks)`).run()
            db.prepare(`DELETE FROM task_review_entries WHERE task_id NOT IN (SELECT task_id FROM tasks)`).run()
            try { db.prepare(`DELETE FROM task_proofread_cache WHERE task_id NOT IN (SELECT task_id FROM tasks)`).run() } catch { /* old schema */ }
            db.prepare(`DELETE FROM task_responses WHERE task_id NOT IN (SELECT task_id FROM tasks)`).run()
            try { db.prepare(`DELETE FROM translation_quality_entries WHERE task_id NOT IN (SELECT task_id FROM tasks)`).run() } catch { /* old schema */ }
            try { db.prepare(`DELETE FROM translation_quality_runs WHERE task_id NOT IN (SELECT task_id FROM tasks)`).run() } catch { /* old schema */ }
            try { db.prepare(`DELETE FROM asr_segments WHERE run_id IN (SELECT id FROM transcription_runs WHERE task_id NOT IN (SELECT task_id FROM tasks))`).run() } catch { /* old schema */ }
            try { db.prepare(`DELETE FROM transcription_runs WHERE task_id NOT IN (SELECT task_id FROM tasks)`).run() } catch { /* old schema */ }
            try { db.prepare(`DELETE FROM review_jobs WHERE task_id NOT IN (SELECT task_id FROM tasks)`).run() } catch { /* old schema */ }
            db.exec('COMMIT')
        } catch (error) {
            try { db.exec('ROLLBACK') } catch { /* ignore rollback failure */ }
            throw error
        }
        for (const row of rows) removeTaskArtifacts(row.task_id)

        return { success: true, deletedCount }
    } catch (e: any) {
        console.error('Failed to clear history:', e)
        throw apiError(500, 'Failed to clear task history')
    }
})
