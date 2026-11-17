import { requireScope } from '../utils/apiTokens'
import { useDb } from '../utils/db'
import { QueueControlService } from '../utils/queueControl'

export default defineEventHandler((event) => {
  requireScope(event, 'tasks:read')
  const rows = useDb().prepare('SELECT status, COUNT(*) AS count FROM task_jobs GROUP BY status').all() as Array<{ status?: string, count?: number }>
  const jobs: Record<string, number> = {}
  for (const row of rows) jobs[String(row.status || '')] = Number(row.count || 0)
  return {
    control: QueueControlService.get(),
    jobs: {
      queued: jobs.queued || 0,
      running: jobs.running || 0,
      paused: jobs.paused || 0,
      retrying: jobs.retrying || 0
    }
  }
})
