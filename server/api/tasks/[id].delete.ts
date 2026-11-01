import { useDb } from '../../utils/db'
import { globalTaskQueue, removeTaskArtifacts } from '../../utils/task'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, message: 'Task ID is required' })
  }

  if (globalTaskQueue.isActive(id) || globalTaskQueue.isQueued(id)) {
    throw createError({ statusCode: 409, message: '任务仍在运行或排队中，请先取消任务' })
  }

  const db = useDb()

  try {
    const task = db.prepare('SELECT task_id, status FROM tasks WHERE task_id = ?').get(id) as any
    if (!task) {
      throw createError({ statusCode: 404, message: 'Task not found' })
    }
    if (['queued', 'probing', 'extracting', 'extracting_audio', 'transcribing', 'ocr', 'parsing', 'translating', 'exporting'].includes(String(task.status || ''))) {
      throw createError({ statusCode: 409, message: '任务仍在运行或排队中，请先取消任务' })
    }

    db.prepare('DELETE FROM task_jobs WHERE task_id = ?').run(id)
    db.prepare('DELETE FROM task_logs WHERE task_id = ?').run(id)
    db.prepare('DELETE FROM task_review_entries WHERE task_id = ?').run(id)
    try { db.prepare('DELETE FROM translation_quality_entries WHERE task_id = ?').run(id) } catch { /* old schema */ }
    try { db.prepare('DELETE FROM translation_quality_runs WHERE task_id = ?').run(id) } catch { /* old schema */ }
    try { db.prepare('DELETE FROM asr_segments WHERE run_id IN (SELECT id FROM transcription_runs WHERE task_id = ?)').run(id) } catch { /* old schema */ }
    try { db.prepare('DELETE FROM transcription_runs WHERE task_id = ?').run(id) } catch { /* old schema */ }
    db.prepare('DELETE FROM task_responses WHERE task_id = ?').run(id)
    const info = db.prepare('DELETE FROM tasks WHERE task_id = ?').run(id)
    removeTaskArtifacts(id)

    return { success: true, deletedCount: info.changes }
  } catch (error: any) {
    if (error?.statusCode) throw error
    console.error('Failed to delete task:', error)
    throw createError({ statusCode: 500, message: 'Failed to delete task' })
  }
})
