import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

const tempRoot = mkdtempSync(join(tmpdir(), 'subx-task-batches-'))
let db: any
let TaskBatchService: typeof import('../taskBatches').TaskBatchService

beforeAll(async () => {
  process.env.DB_PATH = join(tempRoot, 'test.db')
  db = (await import('../db')).useDb()
  TaskBatchService = (await import('../taskBatches')).TaskBatchService
})

afterAll(() => {
  try { db?.close?.() } catch { /* ignore */ }
  rmSync(tempRoot, { recursive: true, force: true })
})

describe('task batches', () => {
  it('creates a scheduled batch and refreshes progress from tasks', () => {
    const batch = TaskBatchService.create({
      name: 'Batch A',
      priority: 5,
      scheduledAt: new Date(Date.now() + 60_000).toISOString(),
      retryPolicy: { maxAttempts: 4 }
    })
    expect(batch.status).toBe('scheduled')
    expect(batch.priority).toBe(5)
    expect(batch.retryPolicy.maxAttempts).toBe(4)

    db.prepare("INSERT INTO tasks (task_id, file_path, model, status, batch_id) VALUES ('b1', '/tmp/a.srt', 'm', 'done', ?)").run(batch.id)
    db.prepare("INSERT INTO tasks (task_id, file_path, model, status, batch_id) VALUES ('b2', '/tmp/b.srt', 'm', 'error', ?)").run(batch.id)
    const refreshed = TaskBatchService.refresh(batch.id)!
    expect(refreshed.taskCount).toBe(2)
    expect(refreshed.completedCount).toBe(1)
    expect(refreshed.failedCount).toBe(1)
    expect(refreshed.status).toBe('completed')
  })

  it('updates priority, schedule and retry policy for queued jobs', () => {
    const batch = TaskBatchService.create({ name: 'Batch Update' })
    db.prepare("INSERT INTO tasks (task_id, file_path, model, status, batch_id) VALUES ('u1', '/tmp/u1.srt', 'm', 'queued', ?)").run(batch.id)
    db.prepare("INSERT INTO task_jobs (task_id, status, batch_id) VALUES ('u1', 'queued', ?)").run(batch.id)
    const scheduledAt = new Date(Date.now() + 120_000).toISOString()
    const updated = TaskBatchService.update(batch.id, {
      priority: 12,
      scheduledAt,
      retryPolicy: { maxAttempts: 5, baseSeconds: 45 }
    })!
    expect(updated.priority).toBe(12)
    expect(updated.status).toBe('scheduled')
    expect(updated.retryPolicy.maxAttempts).toBe(5)
    const job = db.prepare("SELECT priority, scheduled_at, max_attempts FROM task_jobs WHERE task_id = 'u1'").get() as any
    expect(job.priority).toBe(12)
    expect(job.max_attempts).toBe(5)
    expect(job.scheduled_at).toBeTruthy()
  })

  it('pauses and resumes only queued jobs in the batch', () => {
    const batch = TaskBatchService.create({ name: 'Batch B' })
    db.prepare("INSERT INTO tasks (task_id, file_path, model, status, batch_id) VALUES ('p1', '/tmp/p1.srt', 'm', 'queued', ?)").run(batch.id)
    db.prepare("INSERT INTO tasks (task_id, file_path, model, status, batch_id) VALUES ('p2', '/tmp/p2.srt', 'm', 'translating', ?)").run(batch.id)
    db.prepare("INSERT INTO task_jobs (task_id, status, batch_id) VALUES ('p1', 'queued', ?)").run(batch.id)
    db.prepare("INSERT INTO task_jobs (task_id, status, batch_id) VALUES ('p2', 'running', ?)").run(batch.id)

    TaskBatchService.pause(batch.id)
    expect(db.prepare("SELECT status FROM task_jobs WHERE task_id = 'p1'").get()).toEqual({ status: 'paused' })
    expect(db.prepare("SELECT status FROM task_jobs WHERE task_id = 'p2'").get()).toEqual({ status: 'running' })

    const resumed = TaskBatchService.resume(batch.id)!
    expect(resumed.status).toBe('running')
    expect(db.prepare("SELECT status FROM task_jobs WHERE task_id = 'p1'").get()).toEqual({ status: 'queued' })
  })
})
