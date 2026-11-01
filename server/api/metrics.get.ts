import { useDb } from '../utils/db'

export default defineEventHandler((event) => {
  const db = useDb()
  const tasks = db.prepare('SELECT status, COUNT(*) as count FROM tasks GROUP BY status').all() as Array<{ status: string, count: number }>
  const jobs = db.prepare('SELECT status, COUNT(*) as count FROM task_jobs GROUP BY status').all() as Array<{ status: string, count: number }>
  const cache = db.prepare('SELECT COUNT(*) as count FROM translations_cache').get() as { count?: number } | undefined
  const logs = db.prepare('SELECT COUNT(*) as count FROM task_logs').get() as { count?: number } | undefined

  const lines = [
    '# HELP subx_tasks_total Tasks grouped by status.',
    '# TYPE subx_tasks_total gauge',
    ...tasks.map(row => `subx_tasks_total{status="${row.status}"} ${Number(row.count || 0)}`),
    '# HELP subx_jobs_total Queue jobs grouped by status.',
    '# TYPE subx_jobs_total gauge',
    ...jobs.map(row => `subx_jobs_total{status="${row.status}"} ${Number(row.count || 0)}`),
    '# HELP subx_translation_cache_entries Cached translations.',
    '# TYPE subx_translation_cache_entries gauge',
    `subx_translation_cache_entries ${Number(cache?.count || 0)}`,
    '# HELP subx_task_log_entries Persisted task log entries.',
    '# TYPE subx_task_log_entries gauge',
    `subx_task_log_entries ${Number(logs?.count || 0)}`
  ]

  setHeader(event, 'Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
  return lines.join('\n') + '\n'
})
