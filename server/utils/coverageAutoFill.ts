import { randomUUID } from 'crypto'
import { parseTimestamp } from '~~/shared/time'
import type { CoverageAutoFillPolicy, CoverageAutoFillResult, WatchOutputPolicy } from '../../types'
import { ConfigService } from './config'
import { useDb } from './db'
import { buildLibraryCoverage, type CoverageFile } from './libraryCoverage'
import { globalTaskQueue, TaskService } from './task'
import { seriesKeyFromPath, SeriesService } from './series'
import { CostService } from './cost'
import { MetadataService } from './metadata'
import { DEFAULT_WATCH_OUTPUT_POLICY, sanitizeOutputPolicy } from './watchRules'

const TICK_MS = 60_000

function clampInt(value: unknown, min: number, max: number, fallback: number) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.max(min, Math.min(max, Math.floor(parsed))) : fallback
}

function normalizeTime(value: unknown, fallback: string) {
  const match = String(value || '').trim().match(/^([01]?\d|2[0-3]):([0-5]\d)$/)
  return match ? `${match[1]!.padStart(2, '0')}:${match[2]}` : fallback
}

function minutesOfDay(value: string) {
  const [hour, minute] = value.split(':').map(Number)
  return (hour || 0) * 60 + (minute || 0)
}

function localMinutes(date: Date) {
  return date.getHours() * 60 + date.getMinutes()
}

function withinWindow(date: Date, start: string, end: string) {
  if (!start || !end) return true
  const current = localMinutes(date)
  const from = minutesOfDay(start)
  const to = minutesOfDay(end)
  if (from === to) return true
  if (from < to) return current >= from && current < to
  return current >= from || current < to
}

export function coverageDefaultPolicy(rootId: string): CoverageAutoFillPolicy {
  return {
    rootId,
    enabled: false,
    targetLanguage: 'zh-CN',
    scheduleType: 'daily',
    intervalHours: 24,
    dailyTime: '03:00',
    runWindowStart: '',
    runWindowEnd: '',
    maxTasksPerRun: 10,
    skipRecentDays: 1,
    includeEmbedded: true,
    outputPolicy: { ...DEFAULT_WATCH_OUTPUT_POLICY, subtitleStyle: undefined } as WatchOutputPolicy,
    lastRunStatus: 'idle'
  }
}

function rowToPolicy(row: any): CoverageAutoFillPolicy {
  let outputPolicy: any = {}
  try { outputPolicy = JSON.parse(String(row.output_policy_json || '{}')) } catch { outputPolicy = {} }
  return {
    rootId: String(row.root_id),
    enabled: Number(row.enabled) === 1,
    targetLanguage: String(row.target_language || 'zh-CN'),
    scheduleType: row.schedule_type === 'interval' ? 'interval' : 'daily',
    intervalHours: clampInt(row.interval_hours, 1, 168, 24),
    dailyTime: normalizeTime(row.daily_time, '03:00'),
    runWindowStart: normalizeTime(row.run_window_start, '') || '',
    runWindowEnd: normalizeTime(row.run_window_end, '') || '',
    maxTasksPerRun: clampInt(row.max_tasks_per_run, 1, 100, 10),
    skipRecentDays: clampInt(row.skip_recent_days, 0, 365, 1),
    includeEmbedded: Number(row.include_embedded) !== 0,
    outputPolicy: sanitizeOutputPolicy(outputPolicy),
    lastRunAt: row.last_run_at || undefined,
    lastRunStatus: ['idle', 'running', 'done', 'skipped', 'error'].includes(String(row.last_run_status))
      ? String(row.last_run_status) as CoverageAutoFillPolicy['lastRunStatus']
      : 'idle',
    lastRunSummary: row.last_run_summary || undefined,
    createdAt: row.created_at || undefined,
    updatedAt: row.updated_at || undefined
  }
}

export function sanitizeCoveragePolicy(input: any, rootId: string): CoverageAutoFillPolicy {
  const fallback = coverageDefaultPolicy(rootId)
  const targetLanguage = String(input?.targetLanguage || fallback.targetLanguage).trim()
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,34}$/.test(targetLanguage)) throw new Error('目标语言格式不合法')
  return {
    ...fallback,
    rootId,
    enabled: input?.enabled === true,
    targetLanguage,
    scheduleType: input?.scheduleType === 'interval' ? 'interval' : 'daily',
    intervalHours: clampInt(input?.intervalHours, 1, 168, 24),
    dailyTime: normalizeTime(input?.dailyTime, '03:00'),
    runWindowStart: String(input?.runWindowStart || '').trim() ? normalizeTime(input.runWindowStart, '') : '',
    runWindowEnd: String(input?.runWindowEnd || '').trim() ? normalizeTime(input.runWindowEnd, '') : '',
    maxTasksPerRun: clampInt(input?.maxTasksPerRun, 1, 100, 10),
    skipRecentDays: clampInt(input?.skipRecentDays, 0, 365, 1),
    includeEmbedded: input?.includeEmbedded !== false,
    outputPolicy: sanitizeOutputPolicy(input?.outputPolicy)
  }
}

export function computeCoverageNextRun(policy: CoverageAutoFillPolicy, now = new Date()): Date | null {
  if (!policy.enabled) return null
  if (policy.scheduleType === 'interval') {
    const last = policy.lastRunAt ? parseTimestamp(policy.lastRunAt) : null
    const base = last && Number.isFinite(last.getTime()) ? last : now
    return new Date(base.getTime() + policy.intervalHours * 60 * 60 * 1000)
  }
  const [hour, minute] = policy.dailyTime.split(':').map(Number)
  const next = new Date(now)
  next.setHours(hour || 0, minute || 0, 0, 0)
  if (next.getTime() <= now.getTime()) next.setDate(next.getDate() + 1)
  return next
}

export function isCoveragePolicyDue(policy: CoverageAutoFillPolicy, now = new Date()) {
  if (!policy.enabled || policy.lastRunStatus === 'running') return false
  if (!withinWindow(now, policy.runWindowStart, policy.runWindowEnd)) return false
  const next = computeCoverageNextRun(policy, now)
  return Boolean(next && next.getTime() <= now.getTime())
}

export const CoverageAutoFillService = {
  async getPolicy(rootId: string): Promise<CoverageAutoFillPolicy> {
    const row = useDb().prepare('SELECT * FROM coverage_auto_fill_policies WHERE root_id = ?').get(rootId) as any
    return row ? rowToPolicy(row) : coverageDefaultPolicy(rootId)
  },

  async listPolicies(): Promise<CoverageAutoFillPolicy[]> {
    const rows = useDb().prepare('SELECT * FROM coverage_auto_fill_policies ORDER BY root_id').all() as any[]
    return rows.map(rowToPolicy)
  },

  async savePolicy(rootId: string, input: any): Promise<CoverageAutoFillPolicy> {
    const policy = sanitizeCoveragePolicy(input, rootId)
    const outputPolicy = sanitizeOutputPolicy({
      ...policy.outputPolicy,
      targetLanguage: policy.targetLanguage
    })
    useDb().prepare(`
      INSERT INTO coverage_auto_fill_policies (
        root_id, enabled, target_language, schedule_type, interval_hours, daily_time,
        run_window_start, run_window_end, max_tasks_per_run, skip_recent_days,
        include_embedded, output_policy_json, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(root_id) DO UPDATE SET
        enabled=excluded.enabled, target_language=excluded.target_language,
        schedule_type=excluded.schedule_type, interval_hours=excluded.interval_hours,
        daily_time=excluded.daily_time, run_window_start=excluded.run_window_start,
        run_window_end=excluded.run_window_end, max_tasks_per_run=excluded.max_tasks_per_run,
        skip_recent_days=excluded.skip_recent_days, include_embedded=excluded.include_embedded,
        output_policy_json=excluded.output_policy_json, updated_at=datetime('now')
    `).run(
      rootId,
      policy.enabled ? 1 : 0,
      policy.targetLanguage,
      policy.scheduleType,
      policy.intervalHours,
      policy.dailyTime,
      policy.runWindowStart,
      policy.runWindowEnd,
      policy.maxTasksPerRun,
      policy.skipRecentDays,
      policy.includeEmbedded ? 1 : 0,
      JSON.stringify(outputPolicy)
    )
    return this.getPolicy(rootId)
  },

  async run(rootId: string, options: { dryRun?: boolean, force?: boolean } = {}): Promise<CoverageAutoFillResult> {
    const policy = await this.getPolicy(rootId)
    const dryRun = options.dryRun === true
    const force = options.force === true
    const reasons: Record<string, number> = {}
    if (!policy.enabled && !force) {
      return { rootId, dryRun, candidates: 0, created: 0, skipped: 0, reasons: { disabled: 1 }, preview: [] }
    }
    if (!force && !withinWindow(new Date(), policy.runWindowStart, policy.runWindowEnd)) {
      return { rootId, dryRun, candidates: 0, created: 0, skipped: 0, reasons: { outside_window: 1 }, preview: [] }
    }
    const budget = await CostService.checkBudget()
    if (!dryRun && !budget.allowed) {
      await this.markRun(rootId, 'skipped', budget.message || '预算已用完')
      return {
        rootId,
        dryRun,
        candidates: 0,
        created: 0,
        skipped: 0,
        reasons: { budget_blocked: 1 },
        preview: [],
        budgetBlocked: true
      }
    }

    const coverage = await buildLibraryCoverage(rootId, {
      targetLanguage: policy.targetLanguage,
      refresh: true,
      includeEmbedded: policy.includeEmbedded
    })
    const missing = coverage.files.filter(file => file.status === 'missing')
    const cutoff = policy.skipRecentDays > 0
      ? Date.now() - policy.skipRecentDays * 24 * 60 * 60 * 1000
      : 0
    const eligible: CoverageFile[] = []
    for (const file of missing) {
      const mtime = file.mtime ? Date.parse(file.mtime) : 0
      if (cutoff && mtime && mtime > cutoff) {
        reasons.recent_file = (reasons.recent_file || 0) + 1
        continue
      }
      eligible.push(file)
    }
    const selected = eligible.slice(0, policy.maxTasksPerRun)
    reasons.eligible = eligible.length
    reasons.capped = Math.max(0, eligible.length - selected.length)
    const preview = selected.slice(0, 20).map(file => ({
      path: file.path,
      name: file.name,
      seriesTitle: file.seriesTitle
    }))

    const costSummary = await CostService.summary()
    const averageTaskCost = costSummary.taskCount > 0 ? costSummary.spentUsd / costSummary.taskCount : 0
    const estimatedCostUsd = Math.round(averageTaskCost * selected.length * 1_000_000) / 1_000_000

    if (dryRun) {
      return {
        rootId,
        dryRun,
        candidates: eligible.length,
        created: 0,
        skipped: missing.length - eligible.length,
        reasons,
        preview,
        estimatedCostUsd,
        budgetBlocked: !budget.allowed,
        summary: `发现 ${missing.length} 个缺失文件，可创建 ${selected.length} 个任务${estimatedCostUsd > 0 ? `，按历史均值预计 $${estimatedCostUsd.toFixed(4)}` : ''}${!budget.allowed ? '；本月预算已用完，实际补齐会暂停' : ''}`
      }
    }

    const config = await ConfigService.getConfig()
    const basePolicy = sanitizeOutputPolicy({
      ...DEFAULT_WATCH_OUTPUT_POLICY,
      ...policy.outputPolicy,
      targetLanguage: policy.targetLanguage,
      model: policy.outputPolicy.model || config.defaultModel,
      stylePreset: policy.outputPolicy.stylePreset || config.stylePreset,
      outputMode: policy.outputPolicy.outputMode || config.outputMode,
      subtitleFormat: policy.outputPolicy.subtitleFormat || config.subtitleFormat,
      subtitleStylePreset: policy.outputPolicy.subtitleStylePreset || config.subtitleStylePreset,
      subtitleStyle: policy.outputPolicy.subtitleStyle || config.subtitleStyle,
      bilingualLayout: policy.outputPolicy.bilingualLayout || config.bilingualLayout
    })
    let created = 0
    for (const file of selected) {
      const latestBudget = await CostService.checkBudget()
      if (!latestBudget.allowed) {
        reasons.budget_blocked = (reasons.budget_blocked || 0) + 1
        break
      }
      try {
        const taskId = randomUUID()
        let title = ''
        let background = ''
        if (config.metadataEnabled === true) {
          const metadata = await MetadataService.enrich(file.path, config)
          if (metadata) {
            title = metadata.title
            background = metadata.overview
          }
        }
        await TaskService.createTask({
          taskId,
          filePath: file.path,
          rootId,
          seriesKey: seriesKeyFromPath(file.path, rootId),
          sourceType: basePolicy.sourceType,
          trackIndex: 0,
          model: basePolicy.model || config.defaultModel,
          targetLanguage: policy.targetLanguage,
          outputMode: basePolicy.outputMode,
          stylePreset: basePolicy.stylePreset,
          stylePrompt: '',
          contentTitle: title,
          contentBackground: background,
          translationMode: config.translationMode || 'non_stream',
          subtitleFormat: basePolicy.subtitleFormat,
          subtitleStylePreset: basePolicy.subtitleStyle?.presetId || basePolicy.subtitleStylePreset,
          subtitleStyle: basePolicy.subtitleStyle,
          bilingualLayout: basePolicy.bilingualLayout,
          origin: 'automation'
        })
        await globalTaskQueue.add(taskId, { apiKey: config.apiKey, baseUrl: config.apiBaseUrl })
        if (title || background) {
          try { SeriesService.updateFromTask(rootId, file.path, taskId, title, background) } catch { /* best-effort */ }
        }
        created += 1
      } catch (error: any) {
        reasons.create_failed = (reasons.create_failed || 0) + 1
        console.warn(`[CoverageFill] Failed to create task for ${file.path}:`, error?.message || error)
      }
    }
    const failed = Number(reasons.create_failed || 0)
    const summary = `缺失 ${missing.length} 个，选中 ${selected.length} 个，已创建 ${created} 个${failed ? `，失败 ${failed} 个` : ''}${reasons.budget_blocked ? '（预算已用完）' : ''}`
    await this.markRun(rootId, created > 0 ? 'done' : 'skipped', summary)
    return {
      rootId,
      dryRun: false,
      candidates: eligible.length,
      created,
      skipped: missing.length - created,
      reasons,
      preview,
      budgetBlocked: Boolean(reasons.budget_blocked),
      summary
    }
  },

  async markRun(rootId: string, status: CoverageAutoFillPolicy['lastRunStatus'], summary: string) {
    try {
      useDb().prepare(`
        UPDATE coverage_auto_fill_policies
        SET last_run_at=datetime('now'), last_run_status=?, last_run_summary=?, updated_at=datetime('now')
        WHERE root_id=?
      `).run(status, summary, rootId)
    } catch { /* policy may not exist for manual force runs */ }
  },

  async tick(now = new Date()) {
    const policies = await this.listPolicies()
    for (const policy of policies) {
      const lastRun = policy.lastRunAt ? parseTimestamp(policy.lastRunAt) : null
      const staleRunning = policy.lastRunStatus === 'running'
        && (!lastRun || now.getTime() - lastRun.getTime() > 2 * 60 * 60 * 1000)
      const checkPolicy = staleRunning ? { ...policy, lastRunStatus: 'idle' as const } : policy
      if (!isCoveragePolicyDue(checkPolicy, now)) continue
      const lockKey = `coverageFill:${policy.rootId}`
      if ((globalThis as any)[lockKey]) continue
      ;(globalThis as any)[lockKey] = true
      let claimed = false
      try {
        const claim = useDb().prepare(`
          UPDATE coverage_auto_fill_policies
          SET last_run_status='running', last_run_at=datetime('now'), updated_at=datetime('now')
          WHERE root_id=?
            AND (last_run_status <> 'running' OR last_run_at IS NULL OR last_run_at < datetime('now', '-2 hours'))
        `).run(policy.rootId)
        claimed = Number(claim?.changes || 0) > 0
        if (!claimed) continue
        await this.markRun(policy.rootId, 'running', '正在扫描媒体库')
        const result = await this.run(policy.rootId, { force: true })
        if ((result.reasons.disabled || 0) === 0 && result.created === 0 && result.candidates === 0) {
          await this.markRun(policy.rootId, 'done', result.summary || '没有需要补齐的字幕')
        }
        console.log(`[CoverageFill] ${policy.rootId}: ${result.summary || result.created}`)
      } catch (error: any) {
        console.error(`[CoverageFill] Failed for ${policy.rootId}:`, error?.message || error)
        await this.markRun(policy.rootId, 'error', String(error?.message || error))
      } finally {
        ;(globalThis as any)[lockKey] = false
      }
    }
  },

  recoverInterrupted() {
    try {
      useDb().prepare("UPDATE coverage_auto_fill_policies SET last_run_status='idle', updated_at=datetime('now') WHERE last_run_status='running' AND (last_run_at IS NULL OR last_run_at < datetime('now', '-2 hours'))").run()
    } catch { /* older schema or read-only database */ }
  },

  startScheduler() {
    const state = globalThis as any
    if (state.__subxCoverageFillTimer) return
    CoverageAutoFillService.recoverInterrupted()
    state.__subxCoverageFillTimer = setInterval(() => { void CoverageAutoFillService.tick() }, TICK_MS)
    state.__subxCoverageFillTimer.unref?.()
    setTimeout(() => { void CoverageAutoFillService.tick() }, 20_000).unref?.()
  },

}
