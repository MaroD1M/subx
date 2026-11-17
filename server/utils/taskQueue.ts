import type { TranslationTask } from '../../types'
import { ConfigService } from './config'
import { useDb } from './db'
import { logger } from './logger'
import { normalizeTaskRetryPolicy, retryDelaySeconds, type TaskRetryPolicy } from './taskRetry'
import { QueueControlService } from './queueControl'
import { parseTimestamp, toDbUtcTimestamp } from '~~/shared/time'
import {
  cancelledTaskIds,
  isTaskCancelled,
  isTerminalStatus,
  taskAbortControllers
} from './taskState'

export interface TaskQueueRunner {
  getTask(taskId: string): TranslationTask | null
  process(taskId: string, openaiConfig?: { apiKey: string, baseUrl?: string }): Promise<void>
}

export interface TaskQueueAddOptions {
  priority?: number
  scheduledAt?: string | null
  batchId?: string | null
  retryPolicy?: Partial<TaskRetryPolicy> | null
}

export class TaskQueue {
  private active = 0
  private pumping = false
  private workerId = process.env.SUBX_WORKER_ID || `${process.pid}`
  private runtimeConfigs = new Map<string, { apiKey: string, baseUrl?: string }>()
  private heartbeats = new Map<string, ReturnType<typeof setInterval>>()
  private wakeTimer: ReturnType<typeof setTimeout> | null = null

  constructor(private runner: TaskQueueRunner) {}

  async add(taskId: string, openaiConfig?: { apiKey: string, baseUrl?: string }, options: TaskQueueAddOptions = {}): Promise<void> {
    const db = useDb()
    cancelledTaskIds.delete(taskId)
    if (openaiConfig) this.runtimeConfigs.set(taskId, openaiConfig)
    const retryPolicy = normalizeTaskRetryPolicy(options.retryPolicy)
    const scheduledAt = toDbUtcTimestamp(options.scheduledAt)
    const nextRunAt = scheduledAt || toDbUtcTimestamp(new Date()) || ''
    const priority = Math.max(-1000, Math.min(1000, Math.floor(Number(options.priority) || 0)))
    db.prepare(`
      INSERT INTO task_jobs (task_id, status, attempts, max_attempts, next_run_at, locked_by, locked_at, heartbeat_at, last_error, batch_id, priority, scheduled_at, retry_policy_json, created_at, updated_at)
      VALUES (?, 'queued', 0, ?, ?, NULL, NULL, NULL, NULL, ?, ?, ?, ?, datetime('now'), datetime('now'))
      ON CONFLICT(task_id) DO UPDATE SET
        status='queued',
        attempts=0,
        max_attempts=excluded.max_attempts,
        next_run_at=excluded.next_run_at,
        locked_by=NULL,
        locked_at=NULL,
        heartbeat_at=NULL,
        last_error=NULL,
        batch_id=excluded.batch_id,
        priority=excluded.priority,
        scheduled_at=excluded.scheduled_at,
        retry_policy_json=excluded.retry_policy_json,
        updated_at=datetime('now')
    `).run(
      taskId,
      retryPolicy.maxAttempts,
      nextRunAt,
      options.batchId || null,
      priority,
      scheduledAt,
      JSON.stringify(retryPolicy)
    )
    void this.kick()
  }

  isActive(taskId: string) {
    if (taskAbortControllers.has(taskId)) return true
    try {
      const row = useDb().prepare("SELECT status FROM task_jobs WHERE task_id = ?").get(taskId) as { status?: string } | undefined
      return row?.status === 'running'
    } catch {
      return false
    }
  }

  isQueued(taskId: string) {
    try {
      const row = useDb().prepare("SELECT status FROM task_jobs WHERE task_id = ?").get(taskId) as { status?: string } | undefined
      return row?.status === 'queued'
    } catch {
      return false
    }
  }

  pause(taskId: string): { paused: boolean, pending: boolean } {
    try {
      const db = useDb()
      const row = db.prepare('SELECT status FROM task_jobs WHERE task_id = ?').get(taskId) as { status?: string } | undefined
      const status = String(row?.status || '')
      if (status === 'paused') {
        this.runtimeConfigs.delete(taskId)
        return { paused: true, pending: false }
      }
      if (status === 'queued') {
        db.prepare("UPDATE task_jobs SET status='paused', updated_at=datetime('now') WHERE task_id = ? AND status='queued'").run(taskId)
        this.runtimeConfigs.delete(taskId)
        return { paused: true, pending: false }
      }
      if (status === 'running') {
        this.runtimeConfigs.delete(taskId)
        return { paused: false, pending: true }
      }
      return { paused: false, pending: false }
    } catch {
      return { paused: false, pending: false }
    }
  }

  cancel(taskId: string) {
    cancelledTaskIds.add(taskId)
    taskAbortControllers.get(taskId)?.abort()
    this.runtimeConfigs.delete(taskId)

    let removed = false
    let wasQueued = false
    try {
      const row = useDb().prepare('SELECT status FROM task_jobs WHERE task_id = ?').get(taskId) as { status?: string } | undefined
      wasQueued = row?.status === 'queued'
      const info = useDb().prepare(`
        UPDATE task_jobs
        SET status='cancelled', updated_at=datetime('now')
        WHERE task_id = ? AND status IN ('queued', 'running', 'paused')
      `).run(taskId)
      removed = info.changes > 0
    } catch { /* ignore job table failures */ }
    if (wasQueued) cancelledTaskIds.delete(taskId)
    return removed
  }

  async recoverInterrupted() {
    const db = useDb()
    const staleSeconds = Math.max(60, Number(process.env.SUBX_WORKER_STALE_SECONDS || 120))
    const pausedJobs = db.prepare(`
      UPDATE task_jobs
      SET status='paused', locked_by=NULL, locked_at=NULL, heartbeat_at=NULL, updated_at=datetime('now')
      WHERE status='running'
        AND task_id IN (SELECT task_id FROM tasks WHERE status='paused')
    `).run()
    const recovered = db.prepare(`
      UPDATE task_jobs
      SET status='queued', locked_by=NULL, locked_at=NULL, heartbeat_at=NULL,
          next_run_at=datetime('now'), updated_at=datetime('now')
      WHERE status='running'
        AND (heartbeat_at IS NULL OR heartbeat_at < datetime('now', ?))
        AND task_id NOT IN (SELECT task_id FROM tasks WHERE status='paused')
    `).run(`-${staleSeconds} seconds`)

    const activeStatuses = ['queued', 'retrying', 'probing', 'extracting', 'extracting_audio', 'transcribing', 'ocr', 'parsing', 'translating', 'exporting']
    const created = db.prepare(`
      INSERT INTO task_jobs (task_id, status, attempts, max_attempts, next_run_at, locked_by, locked_at, heartbeat_at, last_error, created_at, updated_at)
      SELECT task_id, 'queued', 0, 3, datetime('now'), NULL, NULL, NULL, NULL, datetime('now'), datetime('now')
      FROM tasks
      WHERE status IN (${activeStatuses.map(() => '?').join(',')})
        AND task_id NOT IN (SELECT task_id FROM task_jobs)
    `).run(...activeStatuses)

    const failedJobs = db.prepare(`
      UPDATE tasks SET status='error', error='任务队列重试失败，请重新创建任务', updated_at=datetime('now')
      WHERE task_id IN (SELECT task_id FROM task_jobs WHERE status='error')
        AND status IN (${activeStatuses.map(() => '?').join(',')})
    `).run(...activeStatuses)

    if (pausedJobs.changes > 0 || recovered.changes > 0 || created.changes > 0 || failedJobs.changes > 0) {
      logger.warn({ paused: pausedJobs.changes, recovered: recovered.changes, created: created.changes, failed: failedJobs.changes }, 'task queue recovered interrupted jobs')
    }
    void this.kick()
  }

  private claimJob(): string | null {
    const db = useDb()
    for (let attempt = 0; attempt < 3; attempt++) {
      const candidate = db.prepare(`
        SELECT task_id FROM task_jobs
        WHERE status='queued' AND next_run_at <= datetime('now') AND attempts < max_attempts
        ORDER BY priority DESC, next_run_at ASC, created_at ASC
        LIMIT 1
      `).get() as { task_id?: string } | undefined
      if (!candidate?.task_id) return null

      const info = db.prepare(`
      UPDATE task_jobs
      SET status='running', attempts=attempts + 1, locked_by=?, locked_at=datetime('now'),
          heartbeat_at=datetime('now'), updated_at=datetime('now')
        WHERE task_id = ? AND status='queued'
      `).run(this.workerId, candidate.task_id)
      if (info.changes > 0) return candidate.task_id
    }
    return null
  }

  async wake() {
    await this.kick()
  }

  private async kick() {
    if (this.pumping) return
    this.pumping = true
    try {
      while (true) {
        if (QueueControlService.isPaused()) break
        const config = await ConfigService.getConfig()
        const concurrency = Math.max(1, Number(config.concurrency) || 3)
        if (this.active >= concurrency) break

        const taskId = this.claimJob()
        if (!taskId) break
        if (isTaskCancelled(taskId)) {
          useDb().prepare("UPDATE task_jobs SET status='cancelled', updated_at=datetime('now') WHERE task_id = ?").run(taskId)
          cancelledTaskIds.delete(taskId)
          continue
        }

        const currentTask = this.runner.getTask(taskId)
        if (currentTask?.status === 'paused') {
          useDb().prepare("UPDATE task_jobs SET status='paused', updated_at=datetime('now') WHERE task_id = ?").run(taskId)
          continue
        }
        if (isTerminalStatus(currentTask?.status)) {
          useDb().prepare("UPDATE task_jobs SET status='done', updated_at=datetime('now') WHERE task_id = ?").run(taskId)
          continue
        }

        this.active++
        this.run(taskId)
      }
    } catch (error) {
      logger.error({ err: error }, 'failed to pump task queue')
    } finally {
      this.pumping = false
      this.scheduleWake()
    }
  }

  private scheduleWake() {
    if (this.wakeTimer) {
      clearTimeout(this.wakeTimer)
      this.wakeTimer = null
    }
    if (QueueControlService.isPaused()) return
    try {
      const row = useDb().prepare(`
        SELECT MIN(next_run_at) AS next_run_at
        FROM task_jobs
        WHERE status = 'queued' AND attempts < max_attempts
      `).get() as { next_run_at?: string } | undefined
      const next = parseTimestamp(row?.next_run_at)
      if (!next) return
      const delay = next.getTime() - Date.now()
      if (delay <= 0) return
      this.wakeTimer = setTimeout(() => {
        this.wakeTimer = null
        void this.kick()
      }, Math.min(delay, 2_147_483_647))
      this.wakeTimer.unref?.()
    } catch { /* scheduling is best effort */ }
  }

  private run(taskId: string) {
    const heartbeat = setInterval(() => {
      try {
        useDb().prepare("UPDATE task_jobs SET heartbeat_at=datetime('now'), updated_at=datetime('now') WHERE task_id = ? AND status='running'").run(taskId)
      } catch { /* ignore heartbeat failures */ }
    }, 10_000)
    this.heartbeats.set(taskId, heartbeat)

    this.runner.process(taskId, this.runtimeConfigs.get(taskId))
      .then(() => this.persistJobResult(taskId))
      .catch((error) => this.handleUnexpectedFailure(taskId, error))
      .finally(() => {
        clearInterval(heartbeat)
        this.heartbeats.delete(taskId)
        this.runtimeConfigs.delete(taskId)
        this.active = Math.max(0, this.active - 1)
        void this.kick()
      })
  }

  private persistJobResult(taskId: string) {
    try {
      const db = useDb()
      const job = db.prepare('SELECT status FROM task_jobs WHERE task_id = ?').get(taskId) as { status?: string } | undefined
      if (job?.status && job.status !== 'running') return
      const task = db.prepare('SELECT status FROM tasks WHERE task_id = ?').get(taskId) as { status?: string } | undefined
      const status = String(task?.status || 'error')
      const jobStatus = status === 'done' || status === 'review'
        ? 'done'
        : status === 'cancelled'
          ? 'cancelled'
          : status === 'paused'
            ? 'paused'
            : status === 'queued' || status === 'retrying'
              ? 'queued'
              : 'error'
      db.prepare("UPDATE task_jobs SET status=?, locked_by=NULL, locked_at=NULL, updated_at=datetime('now') WHERE task_id = ?").run(jobStatus, taskId)
    } catch { /* ignore job persistence failures */ }
  }

  private handleUnexpectedFailure(taskId: string, error: any) {
    const message = String(error?.message || error || 'unknown queue error')
    logger.error({ err: error, taskId }, 'task failed unexpectedly in queue')
    try {
      const db = useDb()
      const job = db.prepare('SELECT attempts, max_attempts, retry_policy_json FROM task_jobs WHERE task_id = ?').get(taskId) as { attempts?: number, max_attempts?: number, retry_policy_json?: string } | undefined
      const attempts = Number(job?.attempts || 1)
      const maxAttempts = Number(job?.max_attempts || 3)
      let policy: TaskRetryPolicy | null = null
      try { policy = normalizeTaskRetryPolicy(JSON.parse(String(job?.retry_policy_json || '{}'))) } catch { policy = null }
      const delay = policy ? retryDelaySeconds(policy, attempts) : Math.min(300, 15 * attempts)
      if (attempts < maxAttempts) {
        db.prepare("UPDATE task_jobs SET status='queued', next_run_at=datetime('now', ?), locked_by=NULL, locked_at=NULL, last_error=?, updated_at=datetime('now') WHERE task_id = ?")
          .run(`+${delay} seconds`, message, taskId)
      } else {
        db.prepare("UPDATE task_jobs SET status='error', last_error=?, locked_by=NULL, locked_at=NULL, updated_at=datetime('now') WHERE task_id = ?").run(message, taskId)
        const activeStatuses = ['queued', 'probing', 'extracting', 'extracting_audio', 'transcribing', 'ocr', 'parsing', 'translating', 'exporting']
        db.prepare(`UPDATE tasks SET status='error', error=?, updated_at=datetime('now') WHERE task_id = ? AND status IN (${activeStatuses.map(() => '?').join(',')})`)
          .run(message, taskId, ...activeStatuses)
      }
    } catch { /* ignore */ }
  }
}
