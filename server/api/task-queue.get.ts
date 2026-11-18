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
  const waitingRow = db.prepare(`
    SELECT COUNT(*) AS count
    FROM task_jobs
    WHERE status = 'queued'
      AND next_run_at <= datetime('now')
      AND attempts < max_attempts
  `).get() as { count?: number } | undefined
  const waiting = Number(waitingRow?.count || 0)

  const activeRows = db.prepare(`
    WITH queue_base AS (
      SELECT
        tj.task_id, tj.status AS queue_status, tj.priority, tj.next_run_at, tj.scheduled_at,
        tj.attempts AS queue_attempts, tj.max_attempts AS queue_max_attempts,
        t.file_path, t.status, t.progress, t.step_progress, t.step_message,
        t.target_lang, t.output_mode, t.source_type, t.batch_id,
        t.created_at AS task_created_at, t.started_at, t.pause_requested_at,
        tj.created_at AS job_created_at,
        tb.name AS batch_name,
        CASE
          WHEN tj.status = 'queued'
            AND tj.next_run_at <= datetime('now')
            AND tj.attempts < tj.max_attempts
          THEN 1 ELSE 0
        END AS waiting_eligible
      FROM task_jobs tj
      JOIN tasks t ON t.task_id = tj.task_id
      LEFT JOIN task_batches tb ON tb.id = t.batch_id
      WHERE tj.status IN ('running', 'queued', 'paused')
    ),
    queue_ranked AS (
      SELECT queue_base.*,
        CASE WHEN waiting_eligible = 1 THEN ROW_NUMBER() OVER (
          PARTITION BY waiting_eligible
          ORDER BY priority DESC, next_run_at ASC, job_created_at ASC, task_id ASC
        ) END AS waiting_position
      FROM queue_base
    )
    SELECT * FROM queue_ranked
    ORDER BY
      CASE queue_status WHEN 'running' THEN 0 WHEN 'queued' THEN CASE waiting_eligible WHEN 1 THEN 1 ELSE 2 END ELSE 3 END,
      CASE WHEN queue_status = 'running' THEN started_at ELSE NULL END ASC,
      CASE WHEN queue_status = 'queued' AND waiting_eligible = 0 THEN next_run_at ELSE NULL END ASC,
      priority DESC,
      COALESCE(next_run_at, scheduled_at, job_created_at) ASC,
      job_created_at ASC,
      task_id ASC
    LIMIT ? OFFSET ?
  `).all(pageSize, offset) as any[]

  const tasks = activeRows.map((task) => ({
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
    createdAt: toUtcIsoString(task.task_created_at),
    startedAt: toUtcIsoString(task.started_at),
    scheduledAt: toUtcIsoString(task.scheduled_at),
    nextRunAt: toUtcIsoString(task.next_run_at),
    pauseRequested: Boolean(task.pause_requested_at),
    queueAttempts: Number(task.queue_attempts || 0),
    queueMaxAttempts: Number(task.queue_max_attempts || 0),
    waitingEligible: Boolean(task.waiting_eligible),
    waitingPosition: task.waiting_position == null ? null : Number(task.waiting_position)
  }))

  return {
    control: QueueControlService.get(),
    jobs: {
      queued: jobs.queued || 0,
      waiting,
      scheduled: Math.max(0, (jobs.queued || 0) - waiting),
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
