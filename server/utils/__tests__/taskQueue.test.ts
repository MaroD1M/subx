import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

const tempRoot = mkdtempSync(join(tmpdir(), 'subx-task-queue-'))
let db: any
let TaskQueue: typeof import('../taskQueue').TaskQueue
let isTaskCancelled: typeof import('../taskState').isTaskCancelled
let QueueControlService: typeof import('../queueControl').QueueControlService

beforeAll(async () => {
  process.env.DB_PATH = join(tempRoot, 'test.db')
  db = (await import('../db')).useDb()
  TaskQueue = (await import('../taskQueue')).TaskQueue
  isTaskCancelled = (await import('../taskState')).isTaskCancelled
  QueueControlService = (await import('../queueControl')).QueueControlService
})

afterAll(() => {
  try { db?.close?.() } catch { /* ignore */ }
  rmSync(tempRoot, { recursive: true, force: true })
})

describe('task queue', () => {
  it('pauses a running task without cancelling it', async () => {
    let finishProcess: any = null
    const queue = new TaskQueue({
      getTask: () => ({ taskId: 'queue-pause', status: 'translating' } as any),
      process: () => new Promise<void>((resolve) => { finishProcess = resolve })
    })

    db.prepare(`
      INSERT INTO tasks (task_id, file_path, model, status, progress)
      VALUES ('queue-pause', '/tmp/demo.srt', 'test-model', 'transcribing', 20)
    `).run()

    await queue.add('queue-pause')
    await expect.poll(() => queue.isActive('queue-pause'), { timeout: 2000 }).toBe(true)
    expect(queue.pause('queue-pause')).toEqual({ paused: false, pending: true })
    expect((db.prepare('SELECT status FROM task_jobs WHERE task_id = ?').get('queue-pause') as any).status).toBe('running')
    expect(isTaskCancelled('queue-pause')).toBe(false)

    db.prepare("UPDATE tasks SET status = 'paused' WHERE task_id = 'queue-pause'").run()
    finishProcess?.()
    await expect.poll(
      () => (db.prepare('SELECT status FROM task_jobs WHERE task_id = ?').get('queue-pause') as any)?.status,
      { timeout: 2000 }
    ).toBe('paused')
  })

  it('pauses a queued task immediately', () => {
    db.prepare("INSERT INTO task_jobs (task_id, status) VALUES ('queue-queued-pause', 'queued')").run()
    const queue = new TaskQueue({
      getTask: () => null,
      process: async () => undefined
    })

    expect(queue.pause('queue-queued-pause')).toEqual({ paused: true, pending: false })
    expect((db.prepare('SELECT status FROM task_jobs WHERE task_id = ?').get('queue-queued-pause') as any).status).toBe('paused')
  })

  it('claims higher priority jobs first when concurrency is limited', async () => {
    db.prepare("INSERT OR REPLACE INTO config (key, value, updated_at) VALUES ('concurrency', '1', datetime('now'))").run()
    const order: string[] = []
    const processed = new Set<string>()
    const queue = new TaskQueue({
      getTask: (taskId) => ({ taskId, status: processed.has(taskId) ? 'done' : 'queued' } as any),
      process: async (taskId) => {
        order.push(taskId)
        await new Promise(resolve => setTimeout(resolve, 40))
        processed.add(taskId)
      }
    })
    for (const [taskId, priority] of [['priority-low', 0], ['priority-high', 10]] as const) {
      db.prepare("INSERT INTO tasks (task_id, file_path, model, status) VALUES (?, '/tmp/demo.srt', 'm', 'queued')").run(taskId)
      db.prepare("INSERT INTO task_jobs (task_id, status, priority, next_run_at) VALUES (?, 'queued', ?, datetime('now'))").run(taskId, priority)
    }
    await queue.wake()
    await expect.poll(() => order.length, { timeout: 3000 }).toBe(2)
    expect(order).toEqual(['priority-high', 'priority-low'])
    db.prepare("INSERT OR REPLACE INTO config (key, value, updated_at) VALUES ('concurrency', '3', datetime('now'))").run()
  })

  it('uses priority changes for jobs that are already queued', async () => {
    db.prepare("INSERT OR REPLACE INTO config (key, value, updated_at) VALUES ('concurrency', '1', datetime('now'))").run()
    const order: string[] = []
    const processed = new Set<string>()
    const queue = new TaskQueue({
      getTask: (taskId) => ({ taskId, status: processed.has(taskId) ? 'done' : 'queued' } as any),
      process: async (taskId) => {
        order.push(taskId)
        await new Promise(resolve => setTimeout(resolve, 40))
        processed.add(taskId)
      }
    })
    for (const taskId of ['priority-updated-low', 'priority-updated-high']) {
      db.prepare("INSERT INTO tasks (task_id, file_path, model, status) VALUES (?, '/tmp/demo.srt', 'm', 'queued')").run(taskId)
      db.prepare("INSERT INTO task_jobs (task_id, status, priority, next_run_at) VALUES (?, 'queued', 0, datetime('now'))").run(taskId)
    }
    db.prepare("UPDATE task_jobs SET priority = 30 WHERE task_id = 'priority-updated-high'").run()

    await queue.wake()
    await expect.poll(() => order.length, { timeout: 3000 }).toBe(2)
    expect(order).toEqual(['priority-updated-high', 'priority-updated-low'])
    db.prepare("INSERT OR REPLACE INTO config (key, value, updated_at) VALUES ('concurrency', '3', datetime('now'))").run()
  })

  it('does not claim a job before its scheduled time', async () => {
    const processed: string[] = []
    const queue = new TaskQueue({
      getTask: (taskId) => ({ taskId, status: processed.includes(taskId) ? 'done' : 'queued' } as any),
      process: async (taskId) => { processed.push(taskId) }
    })
    db.prepare("INSERT INTO tasks (task_id, file_path, model, status) VALUES ('scheduled-task', '/tmp/demo.srt', 'm', 'queued')").run()
    await queue.add('scheduled-task', undefined, { scheduledAt: new Date(Date.now() + 60_000).toISOString() })
    await new Promise(resolve => setTimeout(resolve, 60))
    expect(processed).not.toContain('scheduled-task')

    db.prepare("UPDATE task_jobs SET next_run_at = datetime('now', '-1 seconds') WHERE task_id = 'scheduled-task'").run()
    await queue.wake()
    await expect.poll(() => processed, { timeout: 2000 }).toContain('scheduled-task')
  })

  it('pauses claiming new jobs until the queue is resumed', async () => {
    QueueControlService.setPaused(true, 'test')
    const processed: string[] = []
    const queue = new TaskQueue({
      getTask: (taskId) => ({ taskId, status: processed.includes(taskId) ? 'done' : 'queued' } as any),
      process: async (taskId) => { processed.push(taskId) }
    })
    db.prepare("INSERT INTO tasks (task_id, file_path, model, status) VALUES ('paused-queue-task', '/tmp/demo.srt', 'm', 'queued')").run()
    await queue.add('paused-queue-task')
    await new Promise(resolve => setTimeout(resolve, 60))
    expect(processed).not.toContain('paused-queue-task')

    QueueControlService.setPaused(false)
    await queue.wake()
    await expect.poll(() => processed, { timeout: 2000 }).toContain('paused-queue-task')
  })

  it('claims a queued task and supports cancellation', async () => {
    let finishProcess: any = null
    const queue = new TaskQueue({
      getTask: () => ({ taskId: 'queue-task', status: 'queued' } as any),
      process: () => new Promise<void>((resolve) => { finishProcess = resolve })
    })

    await queue.add('queue-task')
    await expect.poll(() => queue.isActive('queue-task'), { timeout: 2000 }).toBe(true)

    expect(queue.cancel('queue-task')).toBe(true)
    expect(isTaskCancelled('queue-task')).toBe(true)

    finishProcess?.()
    await new Promise(resolve => setTimeout(resolve, 20))
  })
})
