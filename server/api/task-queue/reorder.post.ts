import { apiError } from '../../utils/apiError'
import { requireScope } from '../../utils/apiTokens'
import { useDb } from '../../utils/db'
import { parseBody, taskQueueReorderSchema } from '../../utils/validation'

interface QueueJob {
  task_id: string
  priority: number
  next_run_at?: string
  created_at?: string
}

const PRIORITY_MAX = 1000
const PRIORITY_MIN = -1000
const PRIORITY_EDGE_STEP = 1

function balancePriorities(jobs: QueueJob[]) {
  const span = PRIORITY_MAX - PRIORITY_MIN
  const step = jobs.length > 1 ? Math.max(1, Math.floor(span / (jobs.length - 1))) : PRIORITY_MAX
  return jobs.map((job, index) => ({
    taskId: job.task_id,
    priority: Math.max(PRIORITY_MIN, PRIORITY_MAX - index * step)
  }))
}

export default defineEventHandler(async (event) => {
  requireScope(event, 'tasks:write')
  const body = await parseBody(event, taskQueueReorderSchema)
  const db = useDb()

  const jobs = db.prepare(`
    SELECT task_id, priority, next_run_at, created_at
    FROM task_jobs
    WHERE status = 'queued'
      AND next_run_at <= datetime('now')
      AND attempts < max_attempts
    ORDER BY priority DESC, next_run_at ASC, created_at ASC, task_id ASC
  `).all() as QueueJob[]

  const moving = jobs.find(job => job.task_id === body.taskId)
  const target = jobs.find(job => job.task_id === body.targetTaskId)
  if (!moving || !target) {
    throw apiError(400, '仅可调整可立即执行的等待任务顺序')
  }
  if (moving.task_id === target.task_id) {
    return { success: true }
  }

  const ordered = jobs.filter(job => job.task_id !== moving.task_id)
  const targetIndex = ordered.findIndex(job => job.task_id === target.task_id)
  const insertIndex = body.position === 'after' ? targetIndex + 1 : targetIndex
  ordered.splice(insertIndex, 0, moving)

  const movingIndex = ordered.findIndex(job => job.task_id === moving.task_id)
  const previous = ordered[movingIndex - 1]
  const next = ordered[movingIndex + 1]
  let targetPriority: number | null = null

  if (!previous && !next) {
    targetPriority = 0
  } else if (!previous && next) {
    const candidate = Number(next.priority) + PRIORITY_EDGE_STEP
    targetPriority = candidate <= PRIORITY_MAX ? candidate : null
  } else if (previous && !next) {
    const candidate = Number(previous.priority) - PRIORITY_EDGE_STEP
    targetPriority = candidate >= PRIORITY_MIN ? candidate : null
  } else if (previous && next) {
    const high = Number(previous.priority)
    const low = Number(next.priority)
    if (high - low > 1) targetPriority = Math.floor((high + low) / 2)
  }

  const updates = targetPriority == null
    ? balancePriorities(ordered)
    : [{ taskId: moving.task_id, priority: targetPriority }]

  db.exec('BEGIN')
  try {
    const stmt = db.prepare("UPDATE task_jobs SET priority = ?, updated_at = datetime('now') WHERE task_id = ? AND status = 'queued'")
    for (const update of updates) stmt.run(update.priority, update.taskId)
    db.exec('COMMIT')
  } catch (error) {
    try { db.exec('ROLLBACK') } catch { /* ignore rollback failure */ }
    throw error
  }

  return { success: true }
})
