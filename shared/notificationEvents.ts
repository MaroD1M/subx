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

export type NotificationTemplateVariableCategory = 'event' | 'task' | 'batch' | 'watch' | 'glossary' | 'system'

export interface NotificationTemplateVariableDefinition {
  key: string
  label: string
  description: string
  example: string
  category: NotificationTemplateVariableCategory
}

export const NOTIFICATION_TEMPLATE_VARIABLE_DEFINITIONS: NotificationTemplateVariableDefinition[] = [
  { key: 'event', label: '事件代码', description: '触发通知的事件 key，例如 task_done。', example: 'task_done', category: 'event' },
  { key: 'eventLabel', label: '事件名称', description: '事件的中文名称，例如“任务完成”。', example: '任务完成', category: 'event' },
  { key: 'timestamp', label: '触发时间', description: '通知事件的 ISO 时间。', example: '2026-11-18T04:30:00.000Z', category: 'event' },
  { key: 'url', label: '访问地址', description: '当前 SubX 的外部访问地址。', example: 'https://subx.example.com', category: 'event' },
  { key: 'task.id', label: '任务 ID', description: '任务唯一标识，可用于日志和接口定位。', example: 'f3a2…', category: 'task' },
  { key: 'task.fileName', label: '文件名', description: '视频或字幕文件的名称。', example: 'Demo.Show.S01E01.mkv', category: 'task' },
  { key: 'task.filePath', label: '文件路径', description: '任务对应的媒体相对路径。', example: 'Shows/Demo Show/Demo.Show.S01E01.mkv', category: 'task' },
  { key: 'task.status', label: '任务状态代码', description: '内部状态值，例如 done、error。', example: 'done', category: 'task' },
  { key: 'task.statusLabel', label: '任务状态名称', description: '任务状态的中文名称。', example: '完成', category: 'task' },
  { key: 'task.progress', label: '任务进度', description: '任务进度百分比。', example: '100', category: 'task' },
  { key: 'task.model', label: '翻译模型', description: '当前任务使用的 AI 模型。', example: 'deepseek-chat', category: 'task' },
  { key: 'task.targetLanguage', label: '目标语言', description: '任务的翻译目标语言。', example: 'zh-CN', category: 'task' },
  { key: 'task.outputMode', label: '输出模式', description: 'translated / bilingual / original。', example: 'bilingual', category: 'task' },
  { key: 'task.sourceType', label: '字幕来源', description: 'embedded / external / asr / ocr。', example: 'asr', category: 'task' },
  { key: 'task.outputPath', label: '输出文件', description: '生成字幕文件的路径；尚未生成时为空。', example: 'Shows/Demo Show/Demo.Show.S01E01.zh-CN.srt', category: 'task' },
  { key: 'task.error', label: '错误信息', description: '任务失败时的错误摘要；成功时为空。', example: '鉴权失败', category: 'task' },
  { key: 'task.elapsed', label: '任务耗时', description: '从创建到完成的格式化耗时。', example: '3 分 12 秒', category: 'task' },
  { key: 'task.origin', label: '任务来源', description: '手动创建或自动监控。', example: 'manual', category: 'task' },
  { key: 'batch.id', label: '批次 ID', description: '批次唯一标识。', example: 'batch_xxx', category: 'batch' },
  { key: 'batch.name', label: '批次名称', description: '创建批次时填写的名称。', example: '秋季新番', category: 'batch' },
  { key: 'batch.status', label: '批次状态', description: '批次当前状态。', example: 'completed', category: 'batch' },
  { key: 'batch.taskCount', label: '批次任务数', description: '批次内任务总数。', example: '12', category: 'batch' },
  { key: 'batch.completedCount', label: '批次完成数', description: '批次内已完成任务数。', example: '12', category: 'batch' },
  { key: 'batch.failedCount', label: '批次失败数', description: '批次内失败任务数。', example: '0', category: 'batch' },
  { key: 'watch.folderName', label: '监控目录名称', description: '触发事件的监控目录名称。', example: '新番下载', category: 'watch' },
  { key: 'watch.path', label: '监控目录路径', description: '监控目录或触发文件的相对路径。', example: 'Anime/2026', category: 'watch' },
  { key: 'watch.error', label: '监控错误', description: '监控或回填失败时的错误摘要。', example: '目录不可访问', category: 'watch' },
  { key: 'glossary.scopeType', label: '术语作用域类型', description: 'global 或 series。', example: 'series', category: 'glossary' },
  { key: 'glossary.scopeKey', label: '术语作用域 Key', description: '系列术语对应的系列 Key。', example: 'demo-show', category: 'glossary' },
  { key: 'glossary.total', label: '术语总数', description: '本次导入或更新的术语总数。', example: '120', category: 'glossary' },
  { key: 'glossary.inserted', label: '术语新增数', description: '本次新增的术语数量。', example: '30', category: 'glossary' },
  { key: 'glossary.updated', label: '术语更新数', description: '本次更新的术语数量。', example: '8', category: 'glossary' },
  { key: 'glossary.skipped', label: '术语跳过数', description: '因重复或策略跳过的术语数量。', example: '82', category: 'glossary' }
]

export const NOTIFICATION_TEMPLATE_VARIABLES = NOTIFICATION_TEMPLATE_VARIABLE_DEFINITIONS.map(variable => variable.key)
