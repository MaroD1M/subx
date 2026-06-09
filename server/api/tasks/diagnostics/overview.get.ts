import { useDb } from '../../../utils/db'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const limit = Math.max(1, Math.min(Number(query.limit) || 50, 200))
  const status = query.status ? String(query.status) : ''
  const db = useDb()

  const tasks = (status
    ? db.prepare(`SELECT task_id, status, file_path, created_at, updated_at FROM tasks WHERE status = ? ORDER BY created_at DESC LIMIT ?`).all(status, limit)
    : db.prepare(`SELECT task_id, status, file_path, created_at, updated_at FROM tasks ORDER BY created_at DESC LIMIT ?`).all(limit)
  ) as any[]

  const taskIds = tasks.map(task => String(task.task_id))
  if (taskIds.length === 0) {
    return {
      summary: { totalTasks: 0, doneTasks: 0, reviewTasks: 0, errorTasks: 0, cancelledTasks: 0 },
      translation: {
        totalChunks: 0,
        missingIdChunks: 0,
        chunksWithParseLoss: 0,
        retriedChunks: 0,
        singleRetriedChunks: 0,
        fallbackChunks: 0,
        totalRetryAttempts: 0,
        totalSingleRetryAttempts: 0,
        totalFallbackCount: 0
      },
      riskTags: [],
      responseIssues: [],
      reviewReasons: [],
      sampledTasks: []
    }
  }

  const placeholders = taskIds.map(() => '?').join(',')
  const responseRows = db.prepare(`SELECT task_id, raw_response, response_meta FROM task_responses WHERE task_id IN (${placeholders})`).all(...taskIds) as any[]
  const reviewRows = db.prepare(`SELECT task_id, review_reasons FROM task_review_entries WHERE task_id IN (${placeholders})`).all(...taskIds) as any[]

  const statusCounts = new Map<string, number>()
  for (const task of tasks) {
    const value = String(task.status || '')
    statusCounts.set(value, (statusCounts.get(value) || 0) + 1)
  }

  const riskTagCounts = new Map<string, number>()
  const issueCounts = new Map<string, number>()
  const reviewReasonCounts = new Map<string, number>()
  const translation = {
    totalChunks: responseRows.length,
    missingIdChunks: 0,
    chunksWithParseLoss: 0,
    retriedChunks: 0,
    singleRetriedChunks: 0,
    fallbackChunks: 0,
    totalRetryAttempts: 0,
    totalSingleRetryAttempts: 0,
    totalFallbackCount: 0
  }

  for (const row of responseRows) {
    const raw = String(row.raw_response || '').toLowerCase()
    if (!raw.trim()) issueCounts.set('empty', (issueCounts.get('empty') || 0) + 1)
    else if (/无法|不能|抱歉|对不起|sorry|cannot|can't|unable|policy|safety/.test(raw)) issueCounts.set('refusal', (issueCounts.get('refusal') || 0) + 1)
    else if (/\[content filtered\]|\[filtered\]|content omitted|内容已过滤|已过滤/.test(raw)) issueCounts.set('filtered', (issueCounts.get('filtered') || 0) + 1)
    else if (/```|\{\s*"items"\s*:|^\s*\[/.test(String(row.raw_response || '').trim())) issueCounts.set('structured', (issueCounts.get('structured') || 0) + 1)
    else issueCounts.set('plain', (issueCounts.get('plain') || 0) + 1)

    let meta: any = null
    try {
      meta = row.response_meta ? JSON.parse(String(row.response_meta)) : null
    } catch {
      meta = null
    }
    if (!meta) continue

    if (Array.isArray(meta.missingIds) && meta.missingIds.length > 0) translation.missingIdChunks += 1
    if (Number(meta.parsedCount || 0) < Number(meta.expectedCount || 0)) translation.chunksWithParseLoss += 1

    const chunkDiagnostics = meta.chunkDiagnostics || {}
    if (Number(chunkDiagnostics.retryAttempts || 0) > 0) translation.retriedChunks += 1
    if (Number(chunkDiagnostics.singleRetryAttempts || 0) > 0) translation.singleRetriedChunks += 1
    if (Number(chunkDiagnostics.fallbackCount || 0) > 0) translation.fallbackChunks += 1
    translation.totalRetryAttempts += Number(chunkDiagnostics.retryAttempts || 0)
    translation.totalSingleRetryAttempts += Number(chunkDiagnostics.singleRetryAttempts || 0)
    translation.totalFallbackCount += Number(chunkDiagnostics.fallbackCount || 0)

    for (const tag of Array.isArray(meta.chunkRisk?.tags) ? meta.chunkRisk.tags : []) {
      riskTagCounts.set(String(tag), (riskTagCounts.get(String(tag)) || 0) + 1)
    }
  }

  for (const row of reviewRows) {
    let reasons: string[] = []
    try {
      reasons = JSON.parse(String(row.review_reasons || '[]'))
    } catch {
      reasons = []
    }
    for (const reason of reasons) {
      reviewReasonCounts.set(String(reason), (reviewReasonCounts.get(String(reason)) || 0) + 1)
    }
  }

  return {
    summary: {
      totalTasks: tasks.length,
      doneTasks: statusCounts.get('done') || 0,
      reviewTasks: statusCounts.get('review') || 0,
      errorTasks: statusCounts.get('error') || 0,
      cancelledTasks: statusCounts.get('cancelled') || 0
    },
    translation,
    riskTags: Array.from(riskTagCounts.entries()).sort((a, b) => b[1] - a[1]).map(([tag, count]) => ({ tag, count })),
    responseIssues: Array.from(issueCounts.entries()).sort((a, b) => b[1] - a[1]).map(([issue, count]) => ({ issue, count })),
    reviewReasons: Array.from(reviewReasonCounts.entries()).sort((a, b) => b[1] - a[1]).map(([reason, count]) => ({ reason, count })),
    sampledTasks: tasks.slice(0, 10).map(task => ({
      taskId: task.task_id,
      status: task.status,
      filePath: task.file_path,
      createdAt: task.created_at,
      updatedAt: task.updated_at
    }))
  }
})
