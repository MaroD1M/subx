import { v4 as uuidv4 } from 'uuid'
import { TaskService, globalTaskQueue } from '../utils/task'
import { ConfigService } from '../utils/config'
import { VideoService } from '../utils/video'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const { filePath, sourceType, trackIndex, targetLanguage, outputMode, model, stylePreset, files, rootId } = body

  const config = await ConfigService.getConfig()
  const taskIds: string[] = []

  const processFile = async (path: string, type: 'embedded' | 'external', track: number, currentRootId?: string) => {
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
      stylePreset: stylePreset || 'default'
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
    const newTaskId = await processFile(
      oldTask.filePath,
      oldTask.sourceType as 'embedded' | 'external',
      oldTask.trackIndex || 0,
      oldTask.rootId
    )
    return { taskId: newTaskId, taskIds: [newTaskId], retriedFrom: body.retryTaskId }
  }

  if (files && Array.isArray(files) && files.length > 0) {
    for (const entry of files) {
      const path = typeof entry === 'string' ? entry : entry.path
      const entryRootId = typeof entry === 'string' ? rootId : entry.rootId
      const ext = path.split('.').pop()?.toLowerCase() || ''
      const isExternal = ['srt', 'vtt', 'ass', 'ssa'].includes(ext)
      let selectedTrack = 0

      if (!isExternal) {
        try {
          const tracks = await VideoService.probeTracks(path, entryRootId)
          const supported = tracks.find(t => t.isSupported)
          if (supported) {
            selectedTrack = supported.index
          } else {
            console.warn(`[Task API] Skipped ${path}: No supported text tracks found.`)
            continue
          }
        } catch {
          continue
        }
      }
      const id = await processFile(path, isExternal ? 'external' : 'embedded', selectedTrack, entryRootId)
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
