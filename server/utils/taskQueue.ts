import type { TranslationTask } from '../../types'
import { ConfigService } from './config'
import { useDb } from './db'
import { logger } from './logger'
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

export class TaskQueue {
  private active = 0
  private pumping = false
  private workerId = process.env.SUBX_WORKER_ID || `${process.pid}`
  private runtimeConfigs = new Map<string, { apiKey: string, baseUrl?: string }>()
  private heartbeats = new Map<string, ReturnType<typeof setInterval>>()

  constructor(private runner: TaskQueueRunner) {}

  async add(taskId: string, openaiConfig?: { apiKey: string, baseUrl?: string }): Promise<void> {
    const db = useDb()
    cancelledTaskIds.delete(taskId)
    if (openaiConfig) this.runtimeConfigs.set(taskId, openaiConfig)
    db.prepare(`
      INSERT INTO task_jobs (task_id, status, attempts, max_attempts, next_run_at, locked_by, locked_at, heartbeat_at, last_error, created_at, updated_at)
      VALUES (?, 'queued', 0, 3, datetime('now'), NULL, NULL, NULL, NULL, datetime('now'), datetime('now'))
      ON CONFLICT(task_id) DO UPDATE SET
        status='queued',
        attempts=0,
        next_run_at=datetime('now'),
        locked_by=NULL,
        locked_at=NULL,
        heartbeat_at=NULL,
        last_error=NULL,
        updated_at=datetime('now')
    `).run(taskId)
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
        WHERE task_id = ? AND status IN ('queued', 'running')
      `).run(taskId)
      removed = info.changes > 0
    } catch { /* ignore job table failures */ }
    if (wasQueued) cancelledTaskIds.delete(taskId)
    return removed
  }

  async recoverInterrupted() {
    const db = useDb()
    const staleSeconds = Math.max(60, Number(process.env.SUBX_WORKER_STALE_SECONDS || 120))
    const recovered = db.prepare(`
      UPDATE task_jobs
      SET status='queued', locked_by=NULL, locked_at=NULL, heartbeat_at=NULL,
          next_run_at=datetime('now'), updated_at=datetime('now')
      WHERE status='running'
        AND (heartbeat_at IS NULL OR heartbeat_at < datetime('now', ?))
    `).run(`-${staleSeconds} seconds`)

    const activeStatuses = ['queued', 'probing', 'extracting', 'extracting_audio', 'transcribing', 'ocr', 'parsing', 'translating', 'exporting']
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

    if (recovered.changes > 0 || created.changes > 0 || failedJobs.changes > 0) {
      logger.warn({ recovered: recovered.changes, created: created.changes, failed: failedJobs.changes }, 'task queue recovered interrupted jobs')
    }
    void this.kick()
  }

  private claimJob(): string | null {
    const db = useDb()
    for (let attempt = 0; attempt < 3; attempt++) {
      const candidate = db.prepare(`
        SELECT task_id FROM task_jobs
        WHERE status='queued' AND next_run_at <= datetime('now') AND attempts < max_attempts
        ORDER BY created_at ASC
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

  private async kick() {
    if (this.pumping) return
    this.pumping = true
    try {
      while (true) {
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
    }
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
      const task = useDb().prepare('SELECT status FROM tasks WHERE task_id = ?').get(taskId) as { status?: string } | undefined
      const status = String(task?.status || 'error')
      const jobStatus = status === 'done' || status === 'review'
        ? 'done'
        : status === 'cancelled'
          ? 'cancelled'
          : 'error'
      useDb().prepare("UPDATE task_jobs SET status=?, locked_by=NULL, locked_at=NULL, updated_at=datetime('now') WHERE task_id = ?").run(jobStatus, taskId)
    } catch { /* ignore job persistence failures */ }
  }

  private handleUnexpectedFailure(taskId: string, error: any) {
    const message = String(error?.message || error || 'unknown queue error')
    logger.error({ err: error, taskId }, 'task failed unexpectedly in queue')
    try {
      const db = useDb()
      const job = db.prepare('SELECT attempts, max_attempts FROM task_jobs WHERE task_id = ?').get(taskId) as { attempts?: number, max_attempts?: number } | undefined
      const attempts = Number(job?.attempts || 1)
      const maxAttempts = Number(job?.max_attempts || 3)
      if (attempts < maxAttempts) {
        db.prepare("UPDATE task_jobs SET status='queued', next_run_at=datetime('now', ?), locked_by=NULL, locked_at=NULL, last_error=?, updated_at=datetime('now') WHERE task_id = ?")
          .run(`+${Math.min(300, 15 * attempts)} seconds`, message, taskId)
      } else {
        db.prepare("UPDATE task_jobs SET status='error', last_error=?, locked_by=NULL, locked_at=NULL, updated_at=datetime('now') WHERE task_id = ?").run(message, taskId)
        const activeStatuses = ['queued', 'probing', 'extracting', 'extracting_audio', 'transcribing', 'ocr', 'parsing', 'translating', 'exporting']
        db.prepare(`UPDATE tasks SET status='error', error=?, updated_at=datetime('now') WHERE task_id = ? AND status IN (${activeStatuses.map(() => '?').join(',')})`)
          .run(message, taskId, ...activeStatuses)
      }
    } catch { /* ignore */ }
  }
}
