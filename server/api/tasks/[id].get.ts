import { TaskService } from '../../utils/task'
import { getMediaRoot } from '../../utils/mediaRoots'
import { useDb } from '../../utils/db'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id') || event.context.params?.id
  if (!id) {
    throw createError({ statusCode: 400, message: 'Task ID is required' })
  }

  try {
    const db = useDb()
    const task = TaskService.getTask(id)
    let rootName = '默认媒体库'
    try {
      const root = await getMediaRoot(task.rootId)
      rootName = root.name
    } catch {
      // ignore fallback
    }

    const reviewRows = db.prepare(`
      SELECT subtitle_id, review_status, review_reasons
      FROM task_review_entries
      WHERE task_id = ?
      ORDER BY CAST(subtitle_id AS INTEGER) ASC
    `).all(id) as Array<{ subtitle_id: string, review_status: string, review_reasons: string }>

    const issueCounts = new Map<string, number>()
    const issueIds = new Map<string, string[]>()
    for (const row of reviewRows) {
      const reasons = JSON.parse(row.review_reasons || '[]') as string[]
      for (const reason of reasons) {
        issueCounts.set(reason, (issueCounts.get(reason) || 0) + 1)
        const ids = issueIds.get(reason) || []
        if (ids.length < 8) ids.push(String(row.subtitle_id))
        issueIds.set(reason, ids)
      }
    }

    const reviewDiagnostics = {
      totalEntries: reviewRows.length,
      needsReview: reviewRows.filter(row => ['needs_review', 'fallback_original', 'missing'].includes(row.review_status)).length,
      issues: Array.from(issueCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .map(([reason, count]) => ({
          reason,
          count,
          subtitleIds: issueIds.get(reason) || []
        }))
    }

    return {
      task: {
        ...task,
        rootName,
        reviewDiagnostics
      }
    }
  } catch {
    throw createError({ statusCode: 404, message: 'Task not found' })
  }
})
