export interface NotificationEventDefinition {
  key: string
  label: string
  category: 'task' | 'batch' | 'watch' | 'glossary' | 'system'
}

export const NOTIFICATION_EVENT_DEFINITIONS: NotificationEventDefinition[] = [
  { key: 'task_queued', label: '任务入队', category: 'task' },
  { key: 'task_started', label: '任务开始', category: 'task' },
  { key: 'task_retrying', label: '任务自动重试', category: 'task' },
  { key: 'task_done', label: '任务完成', category: 'task' },
  { key: 'task_error', label: '任务失败', category: 'task' },
  { key: 'task_cancelled', label: '任务取消', category: 'task' },
  { key: 'task_review_required', label: '任务待核对', category: 'task' },
  { key: 'low_confidence', label: '低置信度', category: 'task' },
  { key: 'batch_created', label: '批次创建', category: 'batch' },
  { key: 'batch_started', label: '批次开始', category: 'batch' },
  { key: 'batch_paused', label: '批次暂停', category: 'batch' },
  { key: 'batch_completed', label: '批次完成', category: 'batch' },
  { key: 'batch_failed', label: '批次失败', category: 'batch' },
  { key: 'watch_error', label: '监控异常', category: 'watch' },
  { key: 'backfill_done', label: '回填完成', category: 'watch' },
  { key: 'glossary_imported', label: '术语导入', category: 'glossary' },
  { key: 'glossary_updated', label: '术语更新', category: 'glossary' },
  { key: 'test', label: '测试通知', category: 'system' }
]

export const NOTIFICATION_EVENT_KEYS = NOTIFICATION_EVENT_DEFINITIONS.map(event => event.key)
export const NOTIFICATION_EVENT_LABELS = Object.fromEntries(NOTIFICATION_EVENT_DEFINITIONS.map(event => [event.key, event.label])) as Record<string, string>
export const DEFAULT_NOTIFICATION_EVENT_KEYS = [
  'task_done',
  'task_error',
  'task_cancelled',
  'task_review_required',
  'low_confidence',
  'batch_paused',
  'batch_completed',
  'batch_failed',
  'watch_error',
  'backfill_done',
  'glossary_imported'
]

export const NOTIFICATION_TEMPLATE_VARIABLES = [
  'event',
  'eventLabel',
  'timestamp',
  'task.id',
  'task.fileName',
  'task.filePath',
  'task.status',
  'task.statusLabel',
  'task.progress',
  'task.model',
  'task.targetLanguage',
  'task.outputMode',
  'task.sourceType',
  'task.outputPath',
  'task.error',
  'task.elapsed',
  'task.origin',
  'batch.id',
  'batch.name',
  'batch.status',
  'batch.taskCount',
  'batch.completedCount',
  'batch.failedCount',
  'watch.folderName',
  'watch.path',
  'watch.error',
  'glossary.scopeType',
  'glossary.scopeKey',
  'glossary.total',
  'glossary.inserted',
  'glossary.updated',
  'glossary.skipped',
  'url'
]
