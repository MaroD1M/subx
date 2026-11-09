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

    await queue.add('queue-pause')
    await expect.poll(() => queue.isActive('queue-pause'), { timeout: 2000 }).toBe(true)
    expect(queue.pause('queue-pause')).toBe(true)
    expect((db.prepare('SELECT status FROM task_jobs WHERE task_id = ?').get('queue-pause') as any).status).toBe('paused')
    expect(isTaskCancelled('queue-pause')).toBe(false)

    finishProcess?.()
    await new Promise(resolve => setTimeout(resolve, 20))
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
