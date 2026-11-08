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

export function isTerminalStatus(status?: string | null) {
  return ['done', 'error', 'review', 'cancelled'].includes(String(status || ''))
}
