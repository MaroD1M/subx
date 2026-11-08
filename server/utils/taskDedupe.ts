import type { TranslationTask } from '../../types'

export const ACTIVE_TASK_STATUSES = [
  'queued',
  'probing',
  'extracting',
  'extracting_audio',
  'transcribing',
  'ocr',
  'parsing',
  'translating',
  'exporting'
] as const

export interface ActiveTaskKey {
  filePath: string
  rootId?: string | null
  targetLanguage: string
  outputMode: string
  subtitleFormat: string
}

export function findActiveTaskDuplicate(db: any, key: ActiveTaskKey): string | null {
  const statuses = [...ACTIVE_TASK_STATUSES]
  const row = db.prepare(`
    SELECT task_id FROM tasks
    WHERE file_path = ?
      AND COALESCE(root_id, '') = COALESCE(?, '')
      AND output_mode = ?
      AND subtitle_format = ?
      AND status IN (${statuses.map(() => '?').join(',')})
      AND (? = 'original' OR target_lang = ?)
    ORDER BY created_at DESC
    LIMIT 1
  `).get(
    key.filePath,
    key.rootId || '',
    key.outputMode,
    key.subtitleFormat,
    ...statuses,
    key.outputMode,
    key.targetLanguage
  ) as { task_id?: string } | undefined
  return row?.task_id ? String(row.task_id) : null
}

export function isActiveTaskStatus(task: TranslationTask | null | undefined): boolean {
  return ACTIVE_TASK_STATUSES.includes(String(task?.status || '') as any)
}
