import { existsSync, mkdirSync, readdirSync } from 'fs'
import { basename, dirname, join, relative } from 'path'
import type { SubtitleEntry, TaskStatus, TranslationTask } from '../../types'
import { AsrService } from './asr/client'
import { acquireAudioLease, extractAudioCached, releaseAudioLease } from './asr/audioCache'
import { useDb } from './db'
import { getMediaRoot, resolveMediaPath } from './mediaRoots'
import { OcrService } from './ocr/client'
import { SubtitleService } from './subtitle'
import { fileNameMatchesLanguage, resolveTrackPolicy, selectTrackForPolicy } from './trackPolicy'
import { VideoService } from './video'
import { writeTaskLog } from './taskLog'
import { assertTaskNotCancelled, ensureTaskNotCancelled } from './taskState'

export interface PrepareTaskSourceOptions {
  taskId: string
  task: TranslationTask
  config: any
  tempDir: string
  signal: AbortSignal
  updateStatus: (taskId: string, status: TaskStatus, progress: number, data?: any) => Promise<void>
}

export interface PreparedTaskSource {
  allEntries: SubtitleEntry[]
  srtPath: string
  audioPath: string
  inputPath: string
  rootPath: string
}

export function findExternalSubtitle(videoAbsolutePath: string, rootPath: string, preferredLanguage = ''): string | null {
  try {
    const base = basename(videoAbsolutePath).replace(/\.[^.]+$/, '')
    const entries = readdirSync(dirname(videoAbsolutePath), { withFileTypes: true })
    const priority = ['.srt', '.ass', '.ssa', '.vtt']
    const candidates = entries
      .filter(entry => entry.isFile() && !entry.name.startsWith('.'))
      .filter(entry => {
        const ext = entry.name.toLowerCase().match(/\.[^.]+$/)?.[0] || ''
        return priority.includes(ext) && (entry.name === `${base}${ext}` || entry.name.startsWith(`${base}.`))
      })
      .sort((a, b) => {
        const aLang = preferredLanguage && fileNameMatchesLanguage(a.name, preferredLanguage) ? 0 : 1
        const bLang = preferredLanguage && fileNameMatchesLanguage(b.name, preferredLanguage) ? 0 : 1
        const aExt = a.name.toLowerCase().match(/\.[^.]+$/)?.[0] || ''
        const bExt = b.name.toLowerCase().match(/\.[^.]+$/)?.[0] || ''
        return aLang - bLang || priority.indexOf(aExt) - priority.indexOf(bExt) || a.name.localeCompare(b.name)
      })
    return candidates[0] ? relative(rootPath, join(dirname(videoAbsolutePath), candidates[0].name)).replaceAll('\\', '/') : null
  } catch {
    return null
  }
}

async function resolveAutomaticSource(taskId: string, task: TranslationTask, config: any, updateStatus: PrepareTaskSourceOptions['updateStatus']) {
  await updateStatus(taskId, 'probing', 5, { stepProgress: 0, stepMessage: '正在分析媒体字幕与音频轨道...', log: '正在分析媒体字幕与音频轨道...' })
  const root = await getMediaRoot(task.rootId)
  const media = await VideoService.probeMedia(task.filePath, task.rootId)
  const trackPolicy = resolveTrackPolicy(task.trackPolicy)
  const textTracks = media.subtitleTracks.filter(track => track.isSupported)
  const bitmapTracks = media.subtitleTracks.filter(track => ['hdmv_pgs_subtitle', 'pgssub', 'dvd_subtitle', 'dvdsub', 'dvb_subtitle', 'xsub'].includes(String(track.codec || '').toLowerCase()))
  const subtitleTrack = selectTrackForPolicy(textTracks, trackPolicy, 'subtitle')
  const bitmapTrack = selectTrackForPolicy(bitmapTracks, trackPolicy, 'subtitle')
  if (subtitleTrack) {
    task.sourceType = 'embedded'
    task.trackIndex = subtitleTrack.index
  } else if (bitmapTrack && config.ocrEnabled) {
    task.sourceType = 'ocr'
    task.trackIndex = bitmapTrack.index
  } else {
    const videoAbsolute = await resolveMediaPath(task.filePath, task.rootId)
    const externalSubtitle = findExternalSubtitle(videoAbsolute, root.path, trackPolicy.subtitleLanguage)
    if (externalSubtitle) {
      task.sourceType = 'external'
      task.sourceSubtitlePath = externalSubtitle
      task.trackIndex = 0
    } else {
      if (!trackPolicy.fallbackToAsr) {
        throw new Error(trackPolicy.allowForcedSubtitle
          ? '未发现可用的文本字幕、外挂字幕或已启用的图像字幕，且已关闭自动语音识别'
          : '未发现可用的非强制字幕轨道，且已关闭自动语音识别。可尝试允许强制字幕轨道或启用 ASR')
      }
      const audioTrack = selectTrackForPolicy(media.audioTracks, trackPolicy, 'audio')
      if (!audioTrack) {
        throw new Error(bitmapTrack
          ? '发现图像字幕但 OCR 未启用，且没有可用音频轨道'
          : '未发现可用的文本字幕轨道或音频轨道')
      }
      task.sourceType = 'asr'
      task.trackIndex = audioTrack.index
    }
  }

  const db = useDb()
  db.prepare('UPDATE tasks SET source_type = ?, source_subtitle_path = ?, track_index = ?, updated_at = datetime(\'now\') WHERE task_id = ?')
    .run(task.sourceType, task.sourceSubtitlePath || null, task.trackIndex, taskId)
  const selectedTrack = media.subtitleTracks.find(track => track.index === task.trackIndex)
  if (selectedTrack) {
    writeTaskLog(taskId, 'probing', 'info', `已选择字幕轨 #${selectedTrack.index} ${selectedTrack.codec} ${selectedTrack.language || 'und'}${selectedTrack.isForced ? ' [强制]' : selectedTrack.isDefault ? ' [默认]' : ''}`)
  } else if (task.sourceType === 'asr') {
    const selectedAudio = media.audioTracks.find(track => track.index === task.trackIndex)
    if (selectedAudio) {
      writeTaskLog(taskId, 'probing', 'info', `已选择音频轨 #${selectedAudio.index} ${selectedAudio.codec} ${selectedAudio.language || 'und'}${selectedAudio.isDefault ? ' [默认]' : ''}`)
    }
  }
  if (trackPolicy.subtitleLanguage) {
    writeTaskLog(taskId, 'probing', 'info', `字幕语言优先：${trackPolicy.subtitleLanguage}`)
  }
  if (trackPolicy.audioLanguage) {
    writeTaskLog(taskId, 'probing', 'info', `音轨语言优先：${trackPolicy.audioLanguage}`)
  }

  const message = task.sourceType === 'asr'
    ? '未发现文本字幕，将使用语音识别。'
    : task.sourceType === 'ocr'
      ? '发现图像字幕，将使用 OCR 识别。'
      : task.sourceType === 'external'
        ? '发现外挂字幕，将直接使用外挂字幕。'
        : '发现文本字幕，将直接提取字幕。'
  await updateStatus(taskId, 'probing', 8, {
    stepProgress: 100,
    stepMessage: message,
    log: message
  })
}

export async function prepareTaskSource(options: PrepareTaskSourceOptions): Promise<PreparedTaskSource> {
  const { taskId, task, config, tempDir, signal, updateStatus } = options
  const db = useDb()
  const root = await getMediaRoot(task.rootId)

  if (!existsSync(tempDir)) {
    mkdirSync(tempDir, { recursive: true })
  }

  if (task.sourceType === 'auto') {
    await resolveAutomaticSource(taskId, task, config, updateStatus)
  }

  const srtPath = task.sourceType === 'external'
    ? await resolveMediaPath(task.sourceSubtitlePath || task.filePath, task.rootId)
    : task.sourceType === 'asr'
      ? ''
      : join(tempDir, `${taskId}.srt`)
  const inputPath = await resolveMediaPath(task.filePath, task.rootId)
  let allEntries: SubtitleEntry[] = []
  let audioPath = ''

  assertTaskNotCancelled(taskId)
  if (task.sourceType === 'ocr') {
    if (!config.ocrEnabled) {
      throw new Error('OCR 未启用，请先在设置中开启图像字幕 OCR 并配置 OCR 服务地址')
    }
    await updateStatus(taskId, 'ocr', 12, { stepProgress: 0, stepMessage: '正在识别图像字幕（PGS/VobSub/DVD）...', log: '正在识别图像字幕（PGS/VobSub/DVD）...' })
    await ensureTaskNotCancelled(taskId)
    const ocrResult = await OcrService.transcribe(inputPath, {
      baseUrl: config.ocrBaseUrl || process.env.OCR_INTERNAL_URL || 'http://127.0.0.1:8001',
      language: config.ocrLanguage || 'en',
      apiKey: config.ocrApiKey || '',
      trackIndex: task.trackIndex ?? 0,
      engine: config.ocrEngine || 'auto',
      minConfidence: config.ocrMinConfidence ?? 25,
      maxSeconds: config.ocrMaxSeconds,
      chunkSeconds: config.ocrChunkSeconds,
      pgsripTimeoutSeconds: config.ocrPgsripTimeoutSeconds,
      ffmpegTimeoutSeconds: config.ocrFfmpegTimeoutSeconds,
      chunkRetries: config.ocrChunkRetries,
      resumeTtlHours: config.ocrResumeTtlHours,
      idleTimeoutMs: config.ocrJobIdleTimeoutMs,
      absoluteTimeoutMs: config.ocrJobAbsoluteTimeoutMs,
      onProgress: (progress, message) => {
        const stepProgress = Math.max(0, Math.min(100, Number(progress) || 0))
        const mapped = 12 + Math.round(stepProgress * 0.08)
        void updateStatus(taskId, 'ocr', mapped, { stepProgress, stepMessage: message, currentText: message }).catch(error => console.error('[Task] Failed to update OCR progress', error))
      }
    }, signal)
    await ensureTaskNotCancelled(taskId)
    const persisted = AsrService.persistResult(taskId, ocrResult)
    allEntries = AsrService.toSubtitleEntries(ocrResult)
    if (allEntries.length === 0) {
      throw new Error('OCR 未生成有效字幕')
    }
    if (ocrResult.diagnostics) {
      const level = ocrResult.diagnostics.pgsError ? 'warn' : 'info'
      writeTaskLog(taskId, 'ocr', level, `[OCR] ${JSON.stringify(ocrResult.diagnostics)}`, 'system')
    }
    task.sourceLanguage = ocrResult.language
    task.asrRunId = persisted.runId
    task.asrConfidence = persisted.confidence
    db.prepare('UPDATE tasks SET source_lang = ?, asr_run_id = ?, asr_confidence = ?, updated_at = datetime(\'now\') WHERE task_id = ?')
      .run(ocrResult.language, persisted.runId, persisted.confidence, taskId)
    await updateStatus(taskId, 'parsing', 22, {
      stepProgress: 100,
      stepMessage: `OCR 完成：${allEntries.length} 条`,
      log: `OCR 完成：${allEntries.length} 条`
    })
  } else if (task.sourceType === 'asr') {
    if (!config.asrEnabled) {
      throw new Error('语音识别未启用，请先在设置中开启语音识别并配置 ASR 服务地址')
    }
    await updateStatus(taskId, 'extracting_audio', 8, {
      stepProgress: 0,
      stepMessage: '正在从视频中提取音频...',
      log: '正在从视频中提取音频...'
    })
    audioPath = await extractAudioCached(
      task.filePath,
      task.trackIndex ?? 0,
      task.rootId,
      (progress, message) => {
        const stepProgress = Math.max(0, Math.min(100, Number(progress) || 0))
        void updateStatus(taskId, 'extracting_audio', 8 + Math.round(stepProgress * 0.08), {
          stepProgress,
          stepMessage: message,
          currentText: message
        }).catch(error => console.error('[Task] Failed to update audio extraction progress', error))
      }
    )
    acquireAudioLease(audioPath)
    try {
    await updateStatus(taskId, 'transcribing', 16, {
      stepProgress: 0,
      stepMessage: '音频已就绪，正在启动语音识别...',
      currentText: '音频已就绪，正在启动语音识别...',
      log: '正在使用本地语音识别生成字幕...'
    })

    await ensureTaskNotCancelled(taskId)
    const asrResult = await AsrService.transcribe(audioPath, {
      baseUrl: config.asrBaseUrl || process.env.ASR_INTERNAL_URL || 'http://127.0.0.1:8000',
      apiKey: config.asrApiKey,
      model: config.asrModel || 'small',
      device: config.asrDevice || 'auto',
      computeType: config.asrComputeType || 'int8',
      uploadTimeoutMs: config.asrUploadTimeoutMs,
      pollTimeoutMs: config.asrPollTimeoutMs,
      jobIdleTimeoutMs: config.asrJobIdleTimeoutMs,
      jobAbsoluteTimeoutMs: config.asrJobAbsoluteTimeoutMs,
      language: config.asrLanguage || 'auto',
      vad: config.asrVad !== false,
      wordTimestamps: config.asrWordTimestamps !== false,
      engine: (config.asrEngine || 'auto') as any,
      preprocess: (config.asrPreprocess || 'off') as any,
      diarize: config.asrDiarization === true,
      cloudEnabled: config.asrCloudEnabled === true,
      cloudBaseUrl: config.asrCloudBaseUrl || 'https://api.openai.com/v1',
      cloudApiKey: config.asrCloudApiKey || '',
      cloudModel: config.asrCloudModel || 'whisper-1',
      cloudFallback: config.asrCloudFallback !== false,
      onProgress: (progress, message) => {
        const stepProgress = Math.max(0, Math.min(100, Number(progress) || 0))
        void updateStatus(taskId, 'transcribing', 16 + Math.round(stepProgress * 0.12), {
          stepProgress,
          stepMessage: message,
          currentText: message
        }).catch(error => console.error('[Task] Failed to update ASR progress', error))
      }
    }, signal)
    await ensureTaskNotCancelled(taskId)
    const persisted = AsrService.persistResult(taskId, asrResult)
    allEntries = AsrService.toSubtitleEntries(asrResult)
    if (allEntries.length === 0) {
      throw new Error('语音识别未生成有效字幕')
    }
    task.sourceLanguage = asrResult.language
    task.asrRunId = persisted.runId
    task.asrConfidence = persisted.confidence
    db.prepare('UPDATE tasks SET source_lang = ?, asr_run_id = ?, asr_confidence = ?, updated_at = datetime(\'now\') WHERE task_id = ?')
      .run(asrResult.language, persisted.runId, persisted.confidence, taskId)
    await updateStatus(taskId, 'parsing', 28, {
      stepProgress: 100,
      stepMessage: `语音识别完成：${allEntries.length} 条`,
      log: `语音识别完成：语言 ${asrResult.language}，${allEntries.length} 条，平均置信度 ${(persisted.confidence * 100).toFixed(1)}%`
    })
    } catch (error) {
      releaseAudioLease(audioPath)
      throw error
    }
  } else {
    await updateStatus(taskId, 'extracting', 10, { stepProgress: 0, stepMessage: '正在从原视频中提取字幕流...', log: '正在从原视频中提取字幕流...' })
    if (task.sourceType === 'embedded') {
      assertTaskNotCancelled(taskId)
      await VideoService.extractSubtitle(task.filePath, task.trackIndex!, srtPath, task.rootId)
      await updateStatus(taskId, 'extracting', 15, { stepProgress: 100, stepMessage: '字幕提取成功', log: '字幕提取成功，保存至临时文件。' })
    } else {
      await updateStatus(taskId, 'extracting', 15, { stepProgress: 100, stepMessage: '使用外部字幕文件', log: '使用外部字幕文件。' })
    }

    assertTaskNotCancelled(taskId)
    await updateStatus(taskId, 'parsing', 20, { stepProgress: 0, stepMessage: '正在解析 SRT 并进行智能分块...', log: '正在解析 SRT 并进行智能分块...' })
    allEntries = await SubtitleService.parseSubtitle(srtPath)
  }

  if (!allEntries.length) {
    throw new Error('未解析到有效字幕条目')
  }

  return { allEntries, srtPath, audioPath, inputPath, rootPath: root.path }
}
