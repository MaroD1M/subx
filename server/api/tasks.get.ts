import { useDb } from '../utils/db'
import { getMediaRoot } from '../utils/mediaRoots'

function toUtcIsoString(value: string | null | undefined) {
  if (!value) return value || ''
  return value.includes('T') ? value : value.replace(' ', 'T') + 'Z'
}

export default defineEventHandler(async () => {
  const db = useDb()
  const rows = db.prepare(`
    SELECT * FROM tasks
    ORDER BY created_at DESC
    LIMIT 100
  `).all() as any[]

  const tasks = await Promise.all(rows.map(async task => {
    let rootName = '默认媒体库'
    try {
      const root = await getMediaRoot(task.root_id)
      rootName = root.name
    } catch {
      // ignore fallback
    }

    return {
      ...task,
      taskId: task.task_id,
      filePath: task.file_path,
      rootId: task.root_id,
      rootName,
      sourceType: task.source_type,
      trackIndex: task.track_index,
      targetLanguage: task.target_lang,
      outputMode: task.output_mode,
      totalChunks: task.total_chunks,
      completedChunks: task.done_chunks,
      createdAt: toUtcIsoString(task.created_at),
      updatedAt: toUtcIsoString(task.updated_at)
    }
  }))

  return { tasks, totalItems: tasks.length }
})
