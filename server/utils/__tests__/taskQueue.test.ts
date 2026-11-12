import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

const tempRoot = mkdtempSync(join(tmpdir(), 'subx-task-queue-'))
let db: any
let TaskQueue: typeof import('../taskQueue').TaskQueue
let isTaskCancelled: typeof import('../taskState').isTaskCancelled

beforeAll(async () => {
  process.env.DB_PATH = join(tempRoot, 'test.db')
  db = (await import('../db')).useDb()
  TaskQueue = (await import('../taskQueue')).TaskQueue
  isTaskCancelled = (await import('../taskState')).isTaskCancelled
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
