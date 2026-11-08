import { apiError } from '../utils/apiError'
import { v4 as uuidv4 } from 'uuid'
import { TaskService, globalTaskQueue } from '../utils/task'
import { ConfigService } from '../utils/config'
import { VideoService } from '../utils/video'
import { parseBody, taskCreateSchema } from '../utils/validation'
import { dedupeBatchEntries } from '../utils/fileScan'
import { STYLE_PRESETS } from '~~/shared/stylePresets'
import type { TrackPolicy } from '~~/types'

export default defineEventHandler(async (event) => {
  const body = await parseBody(event, taskCreateSchema)
  const { filePath, sourceType, trackIndex, trackPolicy, dedupeEpisodes, targetLanguage, outputMode, model, stylePreset, stylePrompt, contentTitle, contentBackground, customInstructions, subtitleFormat, subtitleStylePreset, bilingualLayout, files, rootId } = body

  const config = await ConfigService.getConfig()
  const taskIds: string[] = []
  const allStylePresets = [...STYLE_PRESETS, ...(Array.isArray(config.customStylePresets) ? config.customStylePresets : [])]
  const selectedStyleId = stylePreset || 'default'
  const resolvedStylePrompt = stylePrompt || allStylePresets.find(preset => preset.id === selectedStyleId)?.prompt || ''

  const enqueueTask = async (taskId: string) => {
    try {
      await globalTaskQueue.add(taskId, {
        apiKey: config.apiKey,
        baseUrl: config.apiBaseUrl
      })
    } catch (error: any) {
      await TaskService.updateStatus(taskId, 'error', 0, {
        error: '任务入队失败',
        stepMessage: '任务入队失败',
        log: `任务入队失败：${error?.message || error}`
      })
      throw apiError(500, '任务入队失败，请稍后重试')
    }
  }

  const processFile = async (path: string, type: 'auto' | 'embedded' | 'external' | 'asr' | 'ocr', track: number, currentRootId?: string, policy?: TrackPolicy) => {
    const taskId = uuidv4()
    await TaskService.createTask({
      taskId,
      filePath: path,
      rootId: currentRootId,
      sourceType: type,
      trackIndex: track,
      model: model || config.defaultModel,
      targetLanguage: targetLanguage || config.targetLanguage,
      outputMode: outputMode || 'translated',
      stylePreset: selectedStyleId,
      stylePrompt: resolvedStylePrompt,
      contentTitle: contentTitle || '',
      contentBackground: contentBackground || '',
      customInstructions: customInstructions || '',
      translationMode: config.translationMode || 'non_stream',
      subtitleFormat: (subtitleFormat || config.subtitleFormat || 'srt') as any,
      subtitleStylePreset: subtitleStylePreset || config.subtitleStylePreset || 'bilingual_simple',
      bilingualLayout: (bilingualLayout || config.bilingualLayout || 'translated_first') as any,
      trackPolicy: policy
    })

    await enqueueTask(taskId)

    return taskId
  }

  if (body.retryTaskId) {
    let oldTask: ReturnType<typeof TaskService.getTask>
    try {
      oldTask = TaskService.getTask(String(body.retryTaskId))
    } catch {
      throw apiError(404, '要重试的任务不存在')
    }
    const newTaskId = uuidv4()
    await TaskService.createTask({
      taskId: newTaskId,
      filePath: oldTask.filePath,
      rootId: oldTask.rootId,
      sourceType: oldTask.sourceType as 'embedded' | 'external' | 'asr' | 'ocr',
      trackIndex: oldTask.trackIndex || 0,
      model: oldTask.model || config.defaultModel,
      targetLanguage: oldTask.targetLanguage || config.targetLanguage,
      outputMode: oldTask.outputMode || 'translated',
      stylePreset: oldTask.stylePreset || 'default',
      stylePrompt: oldTask.stylePrompt || allStylePresets.find(preset => preset.id === (oldTask.stylePreset || 'default'))?.prompt || '',
      contentTitle: oldTask.contentTitle || '',
      contentBackground: oldTask.contentBackground || '',
      customInstructions: oldTask.customInstructions || '',
      translationMode: oldTask.translationMode || config.translationMode || 'non_stream',
      subtitleFormat: (oldTask.subtitleFormat || config.subtitleFormat || 'srt') as any,
      subtitleStylePreset: oldTask.subtitleStylePreset || config.subtitleStylePreset || 'bilingual_simple',
      bilingualLayout: (oldTask.bilingualLayout || config.bilingualLayout || 'translated_first') as any,
      trackPolicy: oldTask.trackPolicy,
      forceRetranslate: true
    })

    await enqueueTask(newTaskId)
    return { taskId: newTaskId, taskIds: [newTaskId], retriedFrom: body.retryTaskId }
  }

  if (files && Array.isArray(files) && files.length > 0) {
    const normalized = files.map((entry) => {
      const path = typeof entry === 'string' ? entry : entry.path
      const entryRootId = typeof entry === 'string' ? rootId : entry.rootId
      return { path, rootId: entryRootId }
    })
    const deduped = dedupeEpisodes === true
      ? await dedupeBatchEntries(normalized)
      : { files: normalized, skipped: [], duplicateGroups: 0 }

    for (const entry of deduped.files) {
      const ext = entry.path.split('.').pop()?.toLowerCase() || ''
      const isExternal = ['srt', 'vtt', 'ass', 'ssa'].includes(ext)

      if (isExternal) {
        const id = await processFile(entry.path, 'external', 0, entry.rootId)
        taskIds.push(id)
        continue
      }

      // Video: let the task pipeline decide subtitle vs ASR.
      const id = await processFile(entry.path, 'auto', 0, entry.rootId, trackPolicy)
      taskIds.push(id)
    }

    if (taskIds.length === 0) {
      throw apiError(400, 'No valid files or tracks found')
    }
    return {
      taskIds,
      taskId: taskIds[0],
      skippedDuplicates: deduped.skipped.length,
      duplicateGroups: deduped.duplicateGroups
    }
  }

  if (!filePath) {
    throw apiError(400, 'File path or files array is required')
  }

  const taskId = await processFile(filePath, sourceType || 'embedded', trackIndex || 0, rootId, trackPolicy)
  return { taskId, taskIds: [taskId] }
})
