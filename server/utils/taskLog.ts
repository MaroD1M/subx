export type TaskLogCategory = 'system' | 'translation' | 'export' | 'error' | 'process'

export function resolveTaskLogCategory(
  step: string | null,
  level: 'info' | 'error' | 'warn',
  message: string
): TaskLogCategory {
  if (level === 'error' || step === 'error' || /\b(?:error|failed|failure)\b|失败|错误|异常|取消/i.test(message)) {
    return 'error'
  }
  if (step === 'exporting' || /导出|保存|输出文件/i.test(message)) return 'export'
  if (step === 'translating' || /翻译|文本块|chunk|tokens|模型|术语表|风格/i.test(message)) return 'translation'
  if (
    step === 'queued'
    || step === 'probing'
    || step === 'extracting'
    || step === 'extracting_audio'
    || step === 'transcribing'
    || step === 'ocr'
    || step === 'parsing'
    || /提取|解析|SRT|字幕|初始化|队列|创建|语音识别/i.test(message)
  ) {
    return 'system'
  }
  return 'process'
}

import { appendFileSync, existsSync, mkdirSync } from 'fs'
import { join } from 'path'
import { formatLogTimestamp } from '~~/shared/time'
import { useDb } from './db'
import { isTaskCancelled } from './taskState'

export function writeTaskLog(taskId: string, step: string | null, level: 'info' | 'error' | 'warn', message: string, category?: TaskLogCategory) {
  if (isTaskCancelled(taskId) && step !== 'cancelled' && step !== 'error') {
    return
  }
  const resolvedCategory = category || resolveTaskLogCategory(step, level, message)
  try {
    const db = useDb()
    db.prepare("INSERT INTO task_logs (task_id, step, category, level, message, created_at) VALUES (?, ?, ?, ?, ?, datetime('now'))")
      .run(taskId, step, resolvedCategory, level, message)
  } catch (error) {
    console.error('[TaskLog] Failed to write task log to database', error)
  }

  try {
    const logFile = join(process.cwd(), 'db', 'logs', `task_${taskId}.log`)
    const dir = join(process.cwd(), 'db', 'logs')
    if (!existsSync(dir)) { mkdirSync(dir, { recursive: true }) }
    const ts = formatLogTimestamp(new Date())
    appendFileSync(logFile, `[${ts}] [${level.toUpperCase()}] [${step || '-'}] ${message}\n`)
  } catch { /* best effort */ }
}
