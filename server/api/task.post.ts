import { v4 as uuidv4 } from 'uuid'
import { TaskService, globalTaskQueue } from '../utils/task'
import { ConfigService } from '../utils/config'
import { VideoService } from '../utils/video'
import { parseBody, taskCreateSchema } from '../utils/validation'
import { STYLE_PRESETS } from '~~/shared/stylePresets'

export default defineEventHandler(async (event) => {
  const body = await parseBody(event, taskCreateSchema)
  const { filePath, sourceType, trackIndex, targetLanguage, outputMode, model, stylePreset, stylePrompt, contentTitle, contentBackground, customInstructions, subtitleFormat, subtitleStylePreset, bilingualLayout, files, rootId } = body

  const config = await ConfigService.getConfig()
  const taskIds: string[] = []
  const allStylePresets = [...STYLE_PRESETS, ...(Array.isArray(config.customStylePresets) ? config.customStylePresets : [])]
  const selectedStyleId = stylePreset || 'default'
  const resolvedStylePrompt = stylePrompt || allStylePresets.find(preset => preset.id === selectedStyleId)?.prompt || ''

  const processFile = async (path: string, type: 'auto' | 'embedded' | 'external' | 'asr' | 'ocr', track: number, currentRootId?: string) => {
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
      bilingualLayout: (bilingualLayout || config.bilingualLayout || 'translated_first') as any
    })

    globalTaskQueue.add(taskId, {
      apiKey: config.apiKey,
      baseUrl: config.apiBaseUrl
    }).catch(err => {
      console.error('Task execution error:', err)
    })

    return taskId
  }

  if (body.retryTaskId) {
    const oldTask = TaskService.getTask(String(body.retryTaskId))
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
      forceRetranslate: true
    })

    globalTaskQueue.add(newTaskId, {
      apiKey: config.apiKey,
      baseUrl: config.apiBaseUrl
    }).catch(err => {
      console.error('Task execution error:', err)
    })
    return { taskId: newTaskId, taskIds: [newTaskId], retriedFrom: body.retryTaskId }
  }

  if (files && Array.isArray(files) && files.length > 0) {
    for (const entry of files) {
      const path = typeof entry === 'string' ? entry : entry.path
      const entryRootId = typeof entry === 'string' ? rootId : entry.rootId
      const ext = path.split('.').pop()?.toLowerCase() || ''
      const isExternal = ['srt', 'vtt', 'ass', 'ssa'].includes(ext)
      let selectedTrack = 0

      if (isExternal) {
        const id = await processFile(path, 'external', 0, entryRootId)
        taskIds.push(id)
        continue
      }

      // Video: let the task pipeline decide subtitle vs ASR.
      const id = await processFile(path, 'auto', 0, entryRootId)
      taskIds.push(id)
    }

    if (taskIds.length === 0) {
      throw createError({ statusCode: 400, message: 'No valid files or tracks found' })
    }
    return { taskIds, taskId: taskIds[0] }
  }

  if (!filePath) {
    throw createError({ statusCode: 400, message: 'File path or files array is required' })
  }

  const taskId = await processFile(filePath, sourceType || 'embedded', trackIndex || 0, rootId)
  return { taskId, taskIds: [taskId] }
})
