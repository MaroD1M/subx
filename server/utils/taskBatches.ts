import { v4 as uuidv4 } from 'uuid'
import { useDb } from './db'
import { parseTimestamp, toDbUtcTimestamp, toUtcIsoString } from '~~/shared/time'
import { normalizeTaskRetryPolicy, type TaskRetryPolicy } from './taskRetry'

export type TaskBatchStatus = 'draft' | 'scheduled' | 'queued' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled'

export interface TaskBatch {
  id: string
  name: string
  status: TaskBatchStatus
  priority: number
  scheduledAt?: string
  retryPolicy: TaskRetryPolicy
  taskCount: number
  completedCount: number
  failedCount: number
  createdAt?: string
  startedAt?: string
  finishedAt?: string
  updatedAt?: string
}

export interface TaskBatchInput {
  name?: string
  priority?: number
  scheduledAt?: string | null
  retryPolicy?: unknown
}

function nowDb() {
  return toDbUtcTimestamp(new Date()) || ''
}

function mapBatch(row: any): TaskBatch {
  let policy: unknown = {}
  try { policy = JSON.parse(String(row.policy_json || '{}')).retryPolicy ?? JSON.parse(String(row.policy_json || '{}')) } catch { policy = {} }
  return {
    id: String(row.id),
    name: String(row.name || ''),
    status: String(row.status || 'queued') as TaskBatchStatus,
    priority: Number(row.priority || 0),
    scheduledAt: row.scheduled_at ? toUtcIsoString(row.scheduled_at) : undefined,
    retryPolicy: normalizeTaskRetryPolicy(policy),
    taskCount: Number(row.task_count || 0),
    completedCount: Number(row.completed_count || 0),
    failedCount: Number(row.failed_count || 0),
    createdAt: row.created_at ? toUtcIsoString(row.created_at) : undefined,
    startedAt: row.started_at ? toUtcIsoString(row.started_at) : undefined,
    finishedAt: row.finished_at ? toUtcIsoString(row.finished_at) : undefined,
    updatedAt: row.updated_at ? toUtcIsoString(row.updated_at) : undefined
  }
}

function rawGet(id: string): TaskBatch | null {
  const row = useDb().prepare('SELECT * FROM task_batches WHERE id = ?').get(id) as any
  return row ? mapBatch(row) : null
}

function scheduledStatus(scheduledAt: unknown): TaskBatchStatus {
  const scheduled = parseTimestamp(scheduledAt)
  return scheduled && scheduled.getTime() > Date.now() ? 'scheduled' : 'queued'
}

export const TaskBatchService = {
  create(input: TaskBatchInput = {}): TaskBatch {
    const db = useDb()
    const id = uuidv4()
    const policy = JSON.stringify({ retryPolicy: normalizeTaskRetryPolicy(input.retryPolicy) })
    const scheduledAt = toDbUtcTimestamp(input.scheduledAt)
    const scheduledIso = input.scheduledAt ? toUtcIsoString(input.scheduledAt) : ''
    const name = String(input.name || '').trim().slice(0, 160)
    const priority = Math.max(-1000, Math.min(1000, Math.floor(Number(input.priority) || 0)))
    const status = scheduledStatus(scheduledIso)
    db.prepare(`
      INSERT INTO task_batches (id, name, status, priority, scheduled_at, policy_json, task_count, completed_count, failed_count, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, 0, 0, 0, datetime('now'), datetime('now'))
    `).run(id, name, status, priority, scheduledAt, policy)
    return rawGet(id)!
  },

  get(id: string): TaskBatch | null {
    const batch = rawGet(id)
    if (!batch) return null
    return this.refresh(id) || batch
  },

  list(limit = 50): TaskBatch[] {
    const rows = useDb().prepare('SELECT id FROM task_batches ORDER BY created_at DESC LIMIT ?').all(Math.min(200, Math.max(1, Number(limit) || 50))) as Array<{ id?: string }>
    return rows.map(row => row.id ? this.get(String(row.id)) : null).filter((batch): batch is TaskBatch => Boolean(batch))
  },

  update(id: string, input: TaskBatchInput): TaskBatch | null {
    const existing = rawGet(id)
    if (!existing) return null
    const db = useDb()
    const name = input.name === undefined ? existing.name : String(input.name || '').trim().slice(0, 160)
    const priority = input.priority === undefined ? existing.priority : Math.max(-1000, Math.min(1000, Math.floor(Number(input.priority) || 0)))
    const retryPolicy = input.retryPolicy === undefined ? existing.retryPolicy : normalizeTaskRetryPolicy(input.retryPolicy)
    const scheduledAt = input.scheduledAt === undefined
      ? (existing.scheduledAt ? toDbUtcTimestamp(existing.scheduledAt) : null)
      : toDbUtcTimestamp(input.scheduledAt)
    const status = existing.status === 'paused' || existing.status === 'cancelled' || existing.status === 'completed' || existing.status === 'failed'
      ? existing.status
      : scheduledStatus(scheduledAt)

    db.exec('BEGIN')
    try {
      db.prepare(`
        UPDATE task_batches
        SET name = ?, priority = ?, scheduled_at = ?, policy_json = ?, status = ?, updated_at = datetime('now')
        WHERE id = ?
      `).run(name, priority, scheduledAt, JSON.stringify({ retryPolicy }), status, id)

      db.prepare(`
        UPDATE task_jobs
        SET priority = ?, scheduled_at = ?,
            retry_policy_json = ?, max_attempts = ?, updated_at = datetime('now')
        WHERE batch_id = ?
      `).run(priority, scheduledAt, JSON.stringify(retryPolicy), retryPolicy.maxAttempts, id)
      db.prepare(`
        UPDATE task_jobs
        SET next_run_at = ?
        WHERE batch_id = ? AND status = 'queued'
      `).run(scheduledAt || nowDb(), id)
      db.exec('COMMIT')
    } catch (error) {
      try { db.exec('ROLLBACK') } catch { /* ignore */ }
      throw error
    }

    return this.get(id)
  },

  setStatus(id: string, status: TaskBatchStatus): void {
    useDb().prepare("UPDATE task_batches SET status = ?, updated_at = datetime('now') WHERE id = ?").run(status, id)
  },

  pause(id: string): TaskBatch | null {
    const db = useDb()
    db.prepare("UPDATE task_batches SET status = 'paused', updated_at = datetime('now') WHERE id = ? AND status NOT IN ('completed', 'failed', 'cancelled')").run(id)
    db.prepare("UPDATE task_jobs SET status = 'paused', updated_at = datetime('now') WHERE batch_id = ? AND status = 'queued'").run(id)
    return this.get(id)
  },

  resume(id: string): TaskBatch | null {
    const db = useDb()
    const batch = rawGet(id)
    if (!batch) return null
    const status = scheduledStatus(batch.scheduledAt)
    db.prepare("UPDATE task_batches SET status = ?, updated_at = datetime('now') WHERE id = ? AND status = 'paused'").run(status, id)
    db.prepare(`
      UPDATE task_jobs
      SET status = 'queued', next_run_at = COALESCE(scheduled_at, datetime('now')), updated_at = datetime('now')
      WHERE batch_id = ?
        AND status = 'paused'
        AND task_id NOT IN (SELECT task_id FROM tasks WHERE status = 'paused')
    `).run(id)
    return this.get(id)
  },

  cancel(id: string): TaskBatch | null {
    const db = useDb()
    db.prepare("UPDATE task_batches SET status = 'cancelled', updated_at = datetime('now') WHERE id = ?").run(id)
    db.prepare("UPDATE task_jobs SET status = 'cancelled', updated_at = datetime('now') WHERE batch_id = ? AND status IN ('queued', 'paused')").run(id)
    return this.get(id)
  },

  taskIds(id: string): string[] {
    const rows = useDb().prepare('SELECT task_id FROM tasks WHERE batch_id = ? ORDER BY created_at ASC').all(id) as Array<{ task_id?: string }>
    return rows.map(row => String(row.task_id || '')).filter(Boolean)
  },

  refresh(id: string): TaskBatch | null {
    const db = useDb()
    const batch = rawGet(id)
    if (!batch) return null
    const rows = db.prepare('SELECT status, COUNT(*) AS count FROM tasks WHERE batch_id = ? GROUP BY status').all(id) as Array<{ status?: string, count?: number }>
    const counts = new Map<string, number>()
    let total = 0
    for (const row of rows) {
      const status = String(row.status || '')
      const count = Number(row.count || 0)
      counts.set(status, count)
      total += count
    }
    const completed = (counts.get('done') || 0) + (counts.get('review') || 0)
    const failed = (counts.get('error') || 0) + (counts.get('cancelled') || 0)
    const queued = counts.get('queued') || 0
    const retrying = counts.get('retrying') || 0
    const active = ['probing', 'extracting', 'extracting_audio', 'transcribing', 'ocr', 'parsing', 'translating', 'exporting']
      .reduce((sum, status) => sum + (counts.get(status) || 0), 0)
    const terminal = total > 0 && completed + failed >= total
    const due = !batch.scheduledAt || (parseTimestamp(batch.scheduledAt)?.getTime() || 0) <= Date.now()

    let status: TaskBatchStatus = batch.status
    if (batch.status === 'cancelled') {
      status = 'cancelled'
    } else if (terminal) {
      status = completed > 0 ? 'completed' : 'failed'
    } else if (batch.status === 'paused') {
      status = 'paused'
    } else if (active > 0 || retrying > 0) {
      status = 'running'
    } else if (queued > 0) {
      status = due ? 'queued' : 'scheduled'
    } else if (total === 0) {
      status = due ? 'queued' : 'scheduled'
    }

    const startedAt = batch.startedAt || (status === 'running' ? nowDb() : null)
    const finishedAt = ['completed', 'failed', 'cancelled'].includes(status) ? (batch.finishedAt || nowDb()) : null
    db.prepare(`
      UPDATE task_batches
      SET status = ?, task_count = ?, completed_count = ?, failed_count = ?,
          started_at = COALESCE(started_at, ?), finished_at = ?,
          updated_at = datetime('now')
      WHERE id = ?
    `).run(status, total, completed, failed, startedAt, finishedAt, id)
    return rawGet(id)
  },

  refreshForTask(taskId: string): TaskBatch | null {
    try {
      const row = useDb().prepare('SELECT batch_id FROM tasks WHERE task_id = ?').get(taskId) as { batch_id?: string } | undefined
      if (row?.batch_id) return this.refresh(String(row.batch_id))
    } catch { /* best effort */ }
    return null
  }
}
