const activeTaskIds = new Set<string>()

export function markTaskActive(taskId: string) {
  if (taskId) activeTaskIds.add(taskId)
}

export function unmarkTaskActive(taskId: string) {
  if (taskId) activeTaskIds.delete(taskId)
}

export function isTaskActive(taskId: string): boolean {
  return activeTaskIds.has(taskId)
}

export function getActiveTaskIds(): string[] {
  return Array.from(activeTaskIds)
}
