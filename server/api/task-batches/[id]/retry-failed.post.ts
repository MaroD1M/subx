import { v4 as uuidv4 } from 'uuid'
import { apiError } from '../../../utils/apiError'
import { requireScope } from '../../../utils/apiTokens'
import { ConfigService } from '../../../utils/config'
import { useDb } from '../../../utils/db'
import { TaskBatchService } from '../../../utils/taskBatches'
import { TaskService, globalTaskQueue } from '../../../utils/task'
import { STYLE_PRESETS } from '~~/shared/stylePresets'
import { normalizeSubtitleStyle } from '~~/shared/subtitleStyles'
import { seriesKeyFromPath } from '../../../utils/series'

export default defineEventHandler(async (event) => {
  requireScope(event, 'tasks:write')
  const id = getRouterParam(event, 'id')
  if (!id) throw apiError(400, '批次 ID 不能为空')
  const batch = TaskBatchService.get(id)
  if (!batch) throw apiError(404, '批次不存在')
  const config = await ConfigService.getConfig()
  const db = useDb()
  const rows = db.prepare("SELECT task_id FROM tasks WHERE batch_id = ? AND status IN ('error', 'cancelled') ORDER BY created_at ASC").all(id) as Array<{ task_id?: string }>
  const newTaskIds: string[] = []
  const allStylePresets = [...STYLE_PRESETS, ...(Array.isArray(config.customStylePresets) ? config.customStylePresets : [])]
  for (const row of rows) {
    if (!row.task_id) continue
    try {
      const oldTask = TaskService.getTask(String(row.task_id))
      const newTaskId = uuidv4()
      const stylePrompt = oldTask.stylePrompt || allStylePresets.find(preset => preset.id === (oldTask.stylePreset || 'default'))?.prompt || ''
      await TaskService.createTask({
        taskId: newTaskId,
        filePath: oldTask.filePath,
        rootId: oldTask.rootId,
        seriesKey: oldTask.seriesKey || seriesKeyFromPath(oldTask.filePath, oldTask.rootId),
        sourceType: oldTask.sourceType as 'embedded' | 'external' | 'asr' | 'ocr',
        trackIndex: oldTask.trackIndex || 0,
        model: oldTask.model || config.defaultModel,
        asrCheckpointKey: oldTask.asrCheckpointKey,
        forceAsrRefresh: !oldTask.asrCheckpointKey,
        targetLanguage: oldTask.targetLanguage || config.targetLanguage,
        outputMode: oldTask.outputMode || 'translated',
        stylePreset: oldTask.stylePreset || 'default',
        stylePrompt,
        contentTitle: oldTask.contentTitle || '',
        contentBackground: oldTask.contentBackground || '',
        customInstructions: oldTask.customInstructions || '',
        translationMode: oldTask.translationMode || config.translationMode || 'non_stream',
        subtitleFormat: (oldTask.subtitleFormat || config.subtitleFormat || 'srt') as any,
        subtitleStylePreset: oldTask.subtitleStylePreset || config.subtitleStylePreset || 'bilingual_simple',
        subtitleStyle: oldTask.subtitleStyle ? normalizeSubtitleStyle(oldTask.subtitleStyle, oldTask.outputMode || 'translated') : undefined,
        bilingualLayout: (oldTask.bilingualLayout || config.bilingualLayout || 'translated_first') as any,
        trackPolicy: oldTask.trackPolicy,
        forceRetranslate: true,
        batchId: id
      })
      await globalTaskQueue.add(newTaskId, { apiKey: config.apiKey, baseUrl: config.apiBaseUrl }, {
        batchId: id,
        priority: batch.priority,
        scheduledAt: null,
        retryPolicy: batch.retryPolicy
      })
      newTaskIds.push(newTaskId)
    } catch { /* retry the rest */ }
  }
  const refreshed = TaskBatchService.refresh(id)
  return { batch: refreshed, taskIds: newTaskIds }
})
