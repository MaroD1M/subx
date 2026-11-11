import { useDb } from './db'
import { ConfigService } from './config'
import type { CostSummary } from '../../types'

function monthKey(value?: Date) {
  const date = value || new Date()
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

function monthBounds(month?: string) {
  const selected = /^\d{4}-\d{2}$/.test(String(month || '')) ? String(month) : monthKey()
  const [year, monthNumber] = selected.split('-').map(Number)
  const start = new Date(year!, monthNumber! - 1, 1)
  const end = new Date(year!, monthNumber!, 1)
  const format = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} 00:00:00`
  return { month: selected, start: format(start), end: format(end) }
}

function tokenCost(promptTokens: number, completionTokens: number, promptPer1M: number, completionPer1M: number) {
  return (Math.max(0, promptTokens) / 1_000_000) * Math.max(0, promptPer1M)
    + (Math.max(0, completionTokens) / 1_000_000) * Math.max(0, completionPer1M)
}

export const CostService = {
  async summary(month?: string): Promise<CostSummary> {
    const config = await ConfigService.getConfig()
    const bounds = monthBounds(month)
    const budgetEnabled = config.costBudgetEnabled === true
    const budgetUsd = Math.max(0, Number(config.costBudgetMonthlyUsd || 0))
    const empty: CostSummary = {
      month: bounds.month,
      budgetEnabled,
      budgetUsd,
      spentUsd: 0,
      remainingUsd: budgetUsd,
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      taskCount: 0,
      byModel: []
    }
    try {
      const db = useDb()
      const rows = db.prepare(`
        SELECT model,
          COUNT(*) AS tasks,
          COALESCE(SUM(prompt_tokens), 0) AS prompt_tokens,
          COALESCE(SUM(completion_tokens), 0) AS completion_tokens,
          COALESCE(SUM(total_tokens), 0) AS total_tokens,
          COALESCE(SUM(cost_usd), 0) AS cost_usd
        FROM cost_usage
        WHERE created_at >= ? AND created_at < ?
        GROUP BY model
        ORDER BY cost_usd DESC
      `).all(bounds.start, bounds.end) as any[]
      for (const row of rows) {
        const promptTokens = Number(row.prompt_tokens || 0)
        const completionTokens = Number(row.completion_tokens || 0)
        const totalTokens = Number(row.total_tokens || promptTokens + completionTokens)
        const costUsd = Number(row.cost_usd || 0)
        empty.promptTokens += promptTokens
        empty.completionTokens += completionTokens
        empty.totalTokens += totalTokens
        empty.taskCount += Number(row.tasks || 0)
        empty.spentUsd += costUsd
        empty.byModel.push({
          model: String(row.model || 'unknown'),
          tasks: Number(row.tasks || 0),
          totalTokens,
          costUsd
        })
      }
    } catch {
      // Cost history is optional on partially initialized databases.
    }
    empty.spentUsd = Math.round(empty.spentUsd * 1_000_000) / 1_000_000
    empty.remainingUsd = budgetEnabled ? Math.max(0, budgetUsd - empty.spentUsd) : budgetUsd
    return empty
  },

  async recordTaskCost(taskId: string): Promise<CostSummary> {
    const config = await ConfigService.getConfig()
    try {
      const db = useDb()
      const task = db.prepare('SELECT model FROM tasks WHERE task_id = ?').get(taskId) as { model?: string } | undefined
      const usage = db.prepare(`
        SELECT
          COALESCE(SUM(prompt_tokens), 0) AS prompt_tokens,
          COALESCE(SUM(completion_tokens), 0) AS completion_tokens,
          COALESCE(SUM(total_tokens), 0) AS total_tokens
        FROM task_responses WHERE task_id = ?
      `).get(taskId) as any
      const promptTokens = Number(usage?.prompt_tokens || 0)
      const completionTokens = Number(usage?.completion_tokens || 0)
      const totalTokens = Number(usage?.total_tokens || promptTokens + completionTokens)
      const costUsd = tokenCost(
        promptTokens,
        completionTokens,
        Number(config.costPricePromptPer1M || 0),
        Number(config.costPriceCompletionPer1M || 0)
      )
      db.prepare(`
        INSERT INTO cost_usage (task_id, model, prompt_tokens, completion_tokens, total_tokens, cost_usd, created_at)
        VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
        ON CONFLICT(task_id) DO UPDATE SET
          model=excluded.model, prompt_tokens=excluded.prompt_tokens,
          completion_tokens=excluded.completion_tokens, total_tokens=excluded.total_tokens,
          cost_usd=excluded.cost_usd
      `).run(taskId, String(task?.model || ''), promptTokens, completionTokens, totalTokens, Math.round(costUsd * 1_000_000) / 1_000_000)
    } catch (error: any) {
      console.warn('[Cost] Failed to record task cost:', error?.message || error)
    }
    return this.summary()
  },

  async checkBudget(): Promise<{ allowed: boolean, summary: CostSummary, message?: string }> {
    const summary = await this.summary()
    if (!summary.budgetEnabled || summary.budgetUsd <= 0) return { allowed: true, summary }
    const allowed = summary.spentUsd < summary.budgetUsd
    return {
      allowed,
      summary,
      message: allowed
        ? undefined
        : `本月翻译预算已用完（已用 $${summary.spentUsd.toFixed(4)} / 上限 $${summary.budgetUsd.toFixed(2)}）`
    }
  },


  tokenCost
}
