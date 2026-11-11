import { apiError } from '../utils/apiError'
import { v4 as uuidv4 } from 'uuid'
import { TaskService, globalTaskQueue } from '../utils/task'
import { ConfigService } from '../utils/config'
import { VideoService } from '../utils/video'
import { parseBody, taskCreateSchema } from '../utils/validation'
import { dedupeBatchEntries } from '../utils/fileScan'
import { STYLE_PRESETS } from '~~/shared/stylePresets'
import { normalizeSubtitleStyle } from '~~/shared/subtitleStyles'
import { useDb } from '../utils/db'
import { findActiveTaskDuplicate, isActiveTaskStatus } from '../utils/taskDedupe'
import { SeriesService, seriesKeyFromPath } from '../utils/series'
import { MetadataService } from '../utils/metadata'
import { CostService } from '../utils/cost'
import type { TrackPolicy } from '~~/types'

export default defineEventHandler(async (event) => {
  const body = await parseBody(event, taskCreateSchema)
  const { filePath, sourceType, trackIndex, trackPolicy, dedupeEpisodes, targetLanguage, outputMode, model, stylePreset, stylePrompt, contentTitle, contentBackground, customInstructions, subtitleFormat, subtitleStylePreset, subtitleStyle, bilingualLayout, files, rootId } = body

  const config = await ConfigService.getConfig()
  const budget = await CostService.checkBudget()
  if (!budget.allowed) {
    throw apiError(429, budget.message || '本月翻译预算已用完')
  }
  const taskIds: string[] = []
  let reusedActive = 0
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

  const processFile = async (path: string, type: 'auto' | 'embedded' | 'external' | 'asr' | 'ocr', track: number, currentRootId?: string, policy?: TrackPolicy, persistSeriesProfile = false) => {
    const requestedTarget = targetLanguage || config.targetLanguage
    const requestedOutputMode = outputMode || 'translated'
    const requestedFormat = subtitleFormat || config.subtitleFormat || 'srt'
    const requestedLayout = (bilingualLayout || config.bilingualLayout || 'translated_first') as 'translated_first' | 'original_first'
    const requestedStyle = normalizeSubtitleStyle(subtitleStyle || subtitleStylePreset || config.subtitleStyle || config.subtitleStylePreset, requestedOutputMode)
    const existingTaskId = findActiveTaskDuplicate(useDb(), {
      filePath: path,
      rootId: currentRootId,
      targetLanguage: requestedTarget,
      outputMode: requestedOutputMode,
      subtitleFormat: requestedFormat,
      subtitleStyleJson: requestedFormat === 'srt' ? '' : JSON.stringify(requestedStyle),
      bilingualLayout: requestedOutputMode === 'bilingual' ? requestedLayout : ''
    })
    if (existingTaskId) {
      return { taskId: existingTaskId, reused: true }
    }

    const taskId = uuidv4()
    const seriesKey = seriesKeyFromPath(path, currentRootId)
    let resolvedTitle = contentTitle || ''
    let resolvedBackground = contentBackground || ''
    let metadataFound = false
    if (!resolvedTitle && !resolvedBackground && config.metadataEnabled === true) {
      const metadata = await MetadataService.enrich(path, config)
      if (metadata) {
        resolvedTitle = metadata.title
        resolvedBackground = metadata.overview
        metadataFound = true
      }
    }
    await TaskService.createTask({
      taskId,
      filePath: path,
      rootId: currentRootId,
      seriesKey,
      sourceType: type,
      trackIndex: track,
      model: model || config.defaultModel,
      targetLanguage: requestedTarget,
      outputMode: requestedOutputMode,
      stylePreset: selectedStyleId,
      stylePrompt: resolvedStylePrompt,
      contentTitle: resolvedTitle,
      contentBackground: resolvedBackground,
      customInstructions: customInstructions || '',
      translationMode: config.translationMode || 'non_stream',
      subtitleFormat: requestedFormat as any,
      subtitleStylePreset: requestedStyle.presetId,
      subtitleStyle: requestedStyle,
      bilingualLayout: requestedLayout,
      trackPolicy: policy
    })

    if ((persistSeriesProfile || metadataFound) && (resolvedTitle || resolvedBackground)) {
      try {
        SeriesService.updateFromTask(currentRootId, path, taskId, resolvedTitle, resolvedBackground)
      } catch (error: any) {
        console.warn('[Series] Failed to persist series profile:', error?.message || error)
      }
    }

    await enqueueTask(taskId)

    return { taskId, reused: false }
  }

  if (body.retryTaskId) {
    let oldTask: ReturnType<typeof TaskService.getTask>
    try {
      oldTask = TaskService.getTask(String(body.retryTaskId))
    } catch {
      throw apiError(404, '要重试的任务不存在')
    }
    if (isActiveTaskStatus(oldTask)) {
      throw apiError(409, '原任务仍在运行，无法重试；请先取消或等待完成')
    }
    const newTaskId = uuidv4()
    await TaskService.createTask({
      taskId: newTaskId,
      filePath: oldTask.filePath,
      rootId: oldTask.rootId,
      seriesKey: oldTask.seriesKey || seriesKeyFromPath(oldTask.filePath, oldTask.rootId),
      sourceType: oldTask.sourceType as 'embedded' | 'external' | 'asr' | 'ocr',
      trackIndex: oldTask.trackIndex || 0,
      model: oldTask.model || config.defaultModel,
      asrCheckpointKey: oldTask.asrCheckpointKey,
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
      subtitleStyle: oldTask.subtitleStyle ? normalizeSubtitleStyle(oldTask.subtitleStyle, oldTask.outputMode || 'translated') : undefined,
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
        const result = await processFile(entry.path, 'external', 0, entry.rootId)
        taskIds.push(result.taskId)
        if (result.reused) reusedActive += 1
        continue
      }

      // Video: let the task pipeline decide subtitle vs ASR.
      const result = await processFile(entry.path, 'auto', 0, entry.rootId, trackPolicy)
      taskIds.push(result.taskId)
      if (result.reused) reusedActive += 1
    }

    if (taskIds.length === 0) {
      throw apiError(400, 'No valid files or tracks found')
    }
    return {
      taskIds,
      taskId: taskIds[0],
      skippedDuplicates: deduped.skipped.length,
      duplicateGroups: deduped.duplicateGroups,
      reusedActive
    }
  }

  if (!filePath) {
    throw apiError(400, 'File path or files array is required')
  }

  const result = await processFile(filePath, sourceType || 'embedded', trackIndex || 0, rootId, trackPolicy, true)
  return { taskId: result.taskId, taskIds: [result.taskId], reusedActive: result.reused ? 1 : 0 }
})
