export const cancelledTaskIds = new Set<string>()
export const taskAbortControllers = new Map<string, AbortController>()

export class TaskCancelledError extends Error {
  constructor() {
    super('任务已取消')
    this.name = 'TaskCancelledError'
  }
}

export function isTaskCancelled(taskId: string) {
  return cancelledTaskIds.has(taskId)
}

export function assertTaskNotCancelled(taskId: string) {
  if (isTaskCancelled(taskId)) {
    throw new TaskCancelledError()
  }
}

export async function ensureTaskNotCancelled(taskId: string) {
  if (isTaskCancelled(taskId)) throw new TaskCancelledError()
  try {
    // Cancel requests may be handled by another worker. Poll the persisted
    // task status at coarse boundaries so cross-worker cancellation works.
    const db = (await import('./db')).useDb()
    const row = db.prepare('SELECT status FROM tasks WHERE task_id = ?').get(taskId) as { status?: string } | undefined
    if (row?.status === 'cancelled') {
      cancelledTaskIds.add(taskId)
      throw new TaskCancelledError()
    }
  } catch (error) {
    if (error instanceof TaskCancelledError) throw error
    // DB hiccups must not silently abort a running task.
  }
}

export function isTerminalStatus(status?: string | null) {
  return ['done', 'error', 'review', 'cancelled'].includes(String(status || ''))
}
