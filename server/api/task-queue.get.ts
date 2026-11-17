import { toUtcIsoString } from '~~/shared/time'
import { requireScope } from '../utils/apiTokens'
import { useDb } from '../utils/db'
import { QueueControlService } from '../utils/queueControl'

const DEFAULT_QUEUE_PAGE_SIZE = 20
const MAX_QUEUE_PAGE_SIZE = 100

export default defineEventHandler((event) => {
  requireScope(event, 'tasks:read')
  const db = useDb()
  const query = getQuery(event)
  const requestedPage = Math.max(1, Math.floor(Number(query.page) || 1))
  const pageSize = Math.min(MAX_QUEUE_PAGE_SIZE, Math.max(1, Math.floor(Number(query.pageSize) || DEFAULT_QUEUE_PAGE_SIZE)))
  const rows = db.prepare('SELECT status, COUNT(*) AS count FROM task_jobs GROUP BY status').all() as Array<{ status?: string, count?: number }>
  const jobs: Record<string, number> = {}
  for (const row of rows) jobs[String(row.status || '')] = Number(row.count || 0)

  const totalRow = db.prepare(`
    SELECT COUNT(*) AS count
    FROM task_jobs tj
    JOIN tasks t ON t.task_id = tj.task_id
    WHERE tj.status IN ('running', 'queued', 'paused')
  `).get() as { count?: number } | undefined
  const total = Number(totalRow?.count || 0)
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const page = Math.min(requestedPage, totalPages)
  const offset = (page - 1) * pageSize

  const activeRows = db.prepare(`
    SELECT
      tj.task_id, tj.status AS queue_status, tj.priority, tj.next_run_at, tj.scheduled_at,
      tj.attempts AS queue_attempts, tj.max_attempts AS queue_max_attempts,
      t.file_path, t.status, t.progress, t.step_progress, t.step_message,
      t.target_lang, t.output_mode, t.source_type, t.batch_id,
      t.created_at, t.started_at, t.pause_requested_at,
      tb.name AS batch_name
    FROM task_jobs tj
    JOIN tasks t ON t.task_id = tj.task_id
    LEFT JOIN task_batches tb ON tb.id = t.batch_id
    WHERE tj.status IN ('running', 'queued', 'paused')
    ORDER BY
      CASE tj.status WHEN 'running' THEN 0 WHEN 'queued' THEN 1 ELSE 2 END,
      CASE WHEN tj.status = 'running' THEN t.started_at ELSE NULL END ASC,
      tj.priority DESC,
      COALESCE(tj.next_run_at, tj.scheduled_at, tj.created_at) ASC,
      tj.created_at ASC,
      tj.task_id ASC
    LIMIT ? OFFSET ?
  `).all(pageSize, offset) as any[]

  const tasks = activeRows.map((task, index) => ({
    taskId: task.task_id,
    filePath: task.file_path,
    status: task.status,
    queueStatus: task.queue_status || '',
    priority: Number(task.priority || 0),
    progress: Number(task.progress || 0),
    stepProgress: Number(task.step_progress || 0),
    stepMessage: task.step_message || '',
    targetLanguage: task.target_lang,
    outputMode: task.output_mode,
    sourceType: task.source_type,
    batchId: task.batch_id || undefined,
    batchName: task.batch_name || undefined,
    createdAt: toUtcIsoString(task.created_at),
    startedAt: toUtcIsoString(task.started_at),
    scheduledAt: toUtcIsoString(task.scheduled_at),
    nextRunAt: toUtcIsoString(task.next_run_at),
    pauseRequested: Boolean(task.pause_requested_at),
    queueAttempts: Number(task.queue_attempts || 0),
    queueMaxAttempts: Number(task.queue_max_attempts || 0),
    queuePosition: offset + index + 1
  }))

  return {
    control: QueueControlService.get(),
    jobs: {
      queued: jobs.queued || 0,
      running: jobs.running || 0,
      paused: jobs.paused || 0,
      retrying: jobs.retrying || 0
    },
    tasks,
    page,
    pageSize,
    total,
    totalPages
  }
})
