import { useDb } from './db'
import { ConfigService } from './config'
import { CostService } from './cost'
import { TranslationMemoryService } from './translationMemory'
import { getCoverageIndexSummary } from './libraryCoverage'
import { parseTimestamp } from '~~/shared/time'
import type { OperationsRuntimeOverview } from '~~/types'

const ACTIVE = new Set(['probing', 'extracting', 'extracting_audio', 'transcribing', 'ocr', 'parsing', 'translating', 'exporting'])

function dayKey(value: Date) {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`
}

export async function buildOperationsRuntimeOverview(): Promise<OperationsRuntimeOverview> {
  const db = useDb()
  const config = await ConfigService.getConfig()
  const statusRows = db.prepare('SELECT status, COUNT(*) AS count FROM tasks GROUP BY status').all() as Array<{ status?: string, count?: number | string }>
  const tasks = { queued: 0, active: 0, review: 0, failed: 0, done: 0, total: 0 }
  for (const row of statusRows) {
    const status = String(row.status || '')
    const count = Number(row.count || 0)
    tasks.total += count
    if (status === 'queued') tasks.queued += count
    else if (ACTIVE.has(status)) tasks.active += count
    else if (status === 'review') tasks.review += count
    else if (status === 'error' || status === 'cancelled') tasks.failed += count
    else if (status === 'done') tasks.done += count
  }

  const now = new Date()
  const activity = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(now)
    date.setDate(date.getDate() - (6 - index))
    return { date: dayKey(date), label: `${date.getMonth() + 1}/${date.getDate()}`, done: 0, failed: 0, created: 0 }
  })
  const activityByDate = new Map(activity.map(item => [item.date, item]))
  const cutoff = new Date(now)
  cutoff.setDate(cutoff.getDate() - 6)
  cutoff.setHours(0, 0, 0, 0)
  const rows = db.prepare(`
    SELECT status, created_at, finished_at, updated_at
    FROM tasks WHERE created_at >= ? OR finished_at >= ?
  `).all(`${cutoff.getFullYear()}-${String(cutoff.getMonth() + 1).padStart(2, '0')}-${String(cutoff.getDate()).padStart(2, '0')} 00:00:00`, cutoff.toISOString()) as any[]
  for (const row of rows) {
    const created = parseTimestamp(row.created_at)
    if (created) {
      const item = activityByDate.get(dayKey(created))
      if (item) item.created += 1
    }
    const finished = parseTimestamp(row.finished_at || row.updated_at)
    if (!finished) continue
    const item = activityByDate.get(dayKey(finished))
    if (!item) continue
    if (String(row.status) === 'done') item.done += 1
    else if (['error', 'cancelled'].includes(String(row.status))) item.failed += 1
  }

  const durationRows = db.prepare(`
    SELECT started_at, finished_at FROM tasks
    WHERE status = 'done' AND started_at IS NOT NULL AND finished_at IS NOT NULL
    ORDER BY finished_at DESC LIMIT 200
  `).all() as any[]
  const durations = durationRows.map(row => {
    const start = parseTimestamp(row.started_at)
    const end = parseTimestamp(row.finished_at)
    return start && end ? Math.max(0, end.getTime() - start.getTime()) : 0
  }).filter(value => value > 0)
  const avgDurationMs = durations.length
    ? Math.round(durations.reduce((total, value) => total + value, 0) / durations.length)
    : 0
  const concurrency = Math.max(1, Number(config.concurrency || 3))
  const etaSeconds = avgDurationMs > 0
    ? Math.round(((tasks.queued + tasks.active) * avgDurationMs) / concurrency / 1000)
    : 0

  return {
    tasks,
    activity,
    queue: {
      running: tasks.active,
      queued: tasks.queued,
      concurrency,
      avgDurationMs,
      etaSeconds
    },
    cost: await CostService.summary(),
    coverage: getCoverageIndexSummary(String(config.targetLanguage || 'zh-CN')),
    memory: TranslationMemoryService.stats()
  }
}
