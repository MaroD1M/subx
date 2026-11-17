import { useDb } from './db'
import { ConfigService } from './config'
import { apiError } from './apiError'
import { runReviewRetranslate, type ReviewProviderOverride } from './reviewRetranslate'
import { ReviewVersionService, type ReviewVersionMeta } from './reviewVersions'

export interface ReviewAbOptions {
  taskId: string
  subtitleIds?: string[]
  source?: 'primary' | 'fallback'
  model?: string
  label?: string
  onProgress?: (completed: number, total: number) => void
}

export interface ReviewAbResult {
  version: ReviewVersionMeta | null
  entries: any[]
  model: string
  providerType: string
}

export async function runReviewAb(options: ReviewAbOptions): Promise<ReviewAbResult> {
  const { taskId, subtitleIds = [], onProgress } = options
  const db = useDb()
  const task = db.prepare('SELECT * FROM tasks WHERE task_id = ?').get(taskId) as any
  if (!task) throw apiError(404, 'Task not found')
  if (!['done', 'error', 'review', 'cancelled'].includes(String(task.status))) {
    throw apiError(409, '任务仍在运行，暂时无法生成 A/B 版本')
  }

  const config = await ConfigService.getConfig(true)
  const source = options.source === 'fallback' ? 'fallback' : 'primary'
  let providerOverride: ReviewProviderOverride
  if (source === 'fallback') {
    if (config.fallbackProviderEnabled !== true) throw apiError(400, '备用供应商未启用')
    const model = String(options.model || config.fallbackModel || '').trim()
    if (!model) throw apiError(400, '备用模型不能为空')
    providerOverride = {
      type: String(config.fallbackProviderType || 'openai-compatible'),
      apiKey: String(config.fallbackApiKey || '').trim() || 'not-needed',
      baseUrl: String(config.fallbackApiBaseUrl || '').trim() || undefined,
      model
    }
  } else {
    const model = String(options.model || config.defaultModel || task.model || '').trim()
    if (!model) throw apiError(400, 'A/B 模型不能为空')
    providerOverride = {
      type: String(config.providerType || 'openai-compatible'),
      apiKey: String(config.apiKey || ''),
      baseUrl: String(config.apiBaseUrl || '').trim() || undefined,
      model
    }
  }

  let ids = subtitleIds.map(String).filter(Boolean)
  if (!ids.length) {
    const rows = db.prepare('SELECT subtitle_id FROM task_review_entries WHERE task_id = ? ORDER BY sort_order ASC, CAST(subtitle_id AS INTEGER) ASC').all(taskId) as Array<{ subtitle_id?: string }>
    ids = rows.map(row => String(row.subtitle_id || '')).filter(Boolean)
  }
  if (!ids.length) throw apiError(404, 'No review entries found')

  const result = await runReviewRetranslate({
    taskId,
    subtitleIds: ids,
    providerOverride,
    persist: false,
    sessionId: `subx-ab-${taskId}`,
    onProgress
  })

  const version = ReviewVersionService.snapshotWithTranslations(taskId, result.entries, {
    kind: 'ab',
    label: String(options.label || `A/B · ${providerOverride.model}`).slice(0, 160),
    source: 'system',
    model: providerOverride.model,
    providerType: providerOverride.type
  })

  return {
    version,
    entries: result.entries,
    model: providerOverride.model,
    providerType: providerOverride.type
  }
}
