import { v4 as uuidv4 } from 'uuid'
import { useDb } from './db'
import { logger } from './logger'
import { runReviewRetranslate } from './reviewRetranslate'

export interface ReviewJob {
  id: string
  taskId: string
  status: 'queued' | 'running' | 'done' | 'error'
  total: number
  completed: number
  error: string | null
  result: any | null
  createdAt: string
  updatedAt: string
  startedAt: string | null
  finishedAt: string | null
}

const MAX_CONCURRENT_JOBS = 1

let activeJobs = 0
let pumping = false

function mapJob(row: any): ReviewJob {
  let result: any = null
  if (row?.result_json) {
    try { result = JSON.parse(String(row.result_json)) } catch { result = null }
  }
  return {
    id: String(row.id),
    taskId: String(row.task_id),
    status: String(row.status || 'queued') as ReviewJob['status'],
    total: Number(row.total || 0),
    completed: Number(row.completed || 0),
    error: row.error ? String(row.error) : null,
    result,
    createdAt: String(row.created_at || ''),
    updatedAt: String(row.updated_at || ''),
    startedAt: row.started_at ? String(row.started_at) : null,
    finishedAt: row.finished_at ? String(row.finished_at) : null
  }
}

function claimJob(): any | null {
  const db = useDb()
  const candidate = db.prepare(`
    SELECT id, task_id, subtitle_ids_json
    FROM review_jobs
    WHERE status = 'queued'
    ORDER BY created_at ASC
    LIMIT 1
  `).get() as any
  if (!candidate?.id) return null
  const info = db.prepare(`
    UPDATE review_jobs
    SET status = 'running', started_at = datetime('now'), updated_at = datetime('now')
    WHERE id = ? AND status = 'queued'
  `).run(candidate.id)
  return info.changes > 0 ? candidate : null
}

async function runJob(job: any) {
  const db = useDb()
  const jobId = String(job.id)
  try {
    const subtitleIds = JSON.parse(String(job.subtitle_ids_json || '[]')) as string[]
    const result = await runReviewRetranslate({
      taskId: String(job.task_id),
      subtitleIds,
      onProgress: (completed, total) => {
        try {
          db.prepare(`
            UPDATE review_jobs
            SET completed = ?, total = ?, updated_at = datetime('now')
            WHERE id = ?
          `).run(completed, total, jobId)
        } catch { /* progress is best effort */ }
      }
    })
    db.prepare(`
      UPDATE review_jobs
      SET status = 'done', completed = total, result_json = ?, finished_at = datetime('now'), updated_at = datetime('now')
      WHERE id = ?
    `).run(JSON.stringify(result), jobId)
  } catch (error: any) {
    const message = String(error?.message || error || '核对重译失败')
    try {
      db.prepare(`
        UPDATE review_jobs
        SET status = 'error', error = ?, finished_at = datetime('now'), updated_at = datetime('now')
        WHERE id = ?
      `).run(message, jobId)
    } catch { /* best effort */ }
    logger.error({ err: { message }, jobId, taskId: job.task_id }, 'review retranslate job failed')
  } finally {
    activeJobs = Math.max(0, activeJobs - 1)
    void ReviewJobService.kick()
  }
}

export const ReviewJobService = {
  async kick() {
    if (pumping) return
    pumping = true
    try {
      while (activeJobs < MAX_CONCURRENT_JOBS) {
        const job = claimJob()
        if (!job) break
        activeJobs += 1
        void runJob(job)
      }
    } catch (error) {
      logger.error({ err: error }, 'failed to pump review jobs')
    } finally {
      pumping = false
    }
  },

  create(taskId: string, subtitleIds: string[]) {
    const db = useDb()
    const existing = db.prepare(`
      SELECT id FROM review_jobs
      WHERE task_id = ? AND status IN ('queued', 'running')
      ORDER BY created_at DESC
      LIMIT 1
    `).get(taskId) as { id?: string } | undefined
    if (existing?.id) return this.get(existing.id)

    const id = uuidv4()
    const ids = Array.from(new Set(subtitleIds.map(String).filter(Boolean)))
    db.prepare(`
      INSERT INTO review_jobs (id, task_id, subtitle_ids_json, status, total, completed, created_at, updated_at)
      VALUES (?, ?, ?, 'queued', ?, 0, datetime('now'), datetime('now'))
    `).run(id, taskId, JSON.stringify(ids), ids.length)
    void this.kick()
    return this.get(id)
  },

  get(jobId: string): ReviewJob | null {
    const row = useDb().prepare(`
      SELECT id, task_id, status, total, completed, error, result_json, created_at, updated_at, started_at, finished_at
      FROM review_jobs
      WHERE id = ?
    `).get(jobId)
    return row ? mapJob(row) : null
  },

  latestForTask(taskId: string): ReviewJob | null {
    const row = useDb().prepare(`
      SELECT id, task_id, status, total, completed, error, result_json, created_at, updated_at, started_at, finished_at
      FROM review_jobs
      WHERE task_id = ?
      ORDER BY created_at DESC
      LIMIT 1
    `).get(taskId)
    return row ? mapJob(row) : null
  },

  recoverInterrupted() {
    try {
      useDb().prepare(`
        UPDATE review_jobs
        SET status = 'queued', started_at = NULL, updated_at = datetime('now')
        WHERE status = 'running'
      `).run()
    } catch { /* ignore recovery failures */ }
    void this.kick()
  }
}
