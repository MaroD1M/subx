/**
 * Task queue and end-to-end processing pipeline.
 *
 * Responsibilities: persistent queue claim/recovery, subtitle/ASR/OCR source
 * resolution, translation orchestration, quality checks, review persistence, export and task
 * lifecycle events. Keep long-running work out of request handlers.
 */

import { join, dirname } from 'path'
import { existsSync, rmSync, readdirSync } from 'fs'
import { EventEmitter } from 'events'
import { useDb } from './db'
import { apiError } from './apiError'
import { parseTimestamp, toUtcIsoString } from '~~/shared/time'
import { SubtitleService } from './subtitle'
import { TranslationService } from './translation'
import { persistReviewEntries } from './taskSupport'
import { TaskQueue } from './taskQueue'
import { TaskCancelledError, TaskPausedError, assertTaskNotCancelled, cancelledTaskIds, isTaskCancelled, taskAbortControllers } from './taskState'
import { releaseAudioLease, removeCachedAudio } from './asr/audioCache'
import { markTaskActive, unmarkTaskActive } from './activeTasks'
import { ConfigService } from './config'
import { classifyTaskError } from './taskError'
import { logger } from './logger'
import { resolveTaskLogCategory, writeTaskLog } from './taskLog'
import { finalizeTaskOutput } from './taskFinalize'
import { prepareTaskSource } from './taskSource'
import { translateSubtitles } from './taskTranslate'
import type { TranslationTask, TaskStatus } from '~~/types'
import { deriveOutputBaseName, isSafeOutputSuffix } from './outputNaming'
import { isPathInside } from './pathSafety'
import { acquireOutputLocks } from './outputLock'
import { normalizeSubtitleStyle } from '~~/shared/subtitleStyles'

export const taskEvents = new EventEmitter()
taskEvents.setMaxListeners(0)
export function removeTaskArtifacts(taskId: string) {
    try {
        const logFile = join(process.cwd(), 'db', 'logs', `task_${taskId}.log`)
        if (existsSync(logFile)) rmSync(logFile, { force: true })
    } catch { /* ignore */ }

    try {
        const tempDir = join(process.cwd(), 'temp')
        if (!existsSync(tempDir)) return
        for (const name of readdirSync(tempDir)) {
            if (name.startsWith(`${taskId}.`) || name === `download_orig_${taskId}.srt`) {
                rmSync(join(tempDir, name), { force: true })
            }
        }
    } catch { /* ignore */ }
}

export const TaskService = {
    async createTask(task: Partial<TranslationTask>): Promise<TranslationTask> {
        const db = useDb()
        const subtitleStyle = task.subtitleStyle ? normalizeSubtitleStyle(task.subtitleStyle, task.outputMode) : undefined
        const stmt = db.prepare(`
      INSERT INTO tasks (
        task_id, file_path, root_id, source_type, track_index, model, target_lang, output_mode, style_preset, style_prompt, source_lang, source_subtitle_path, asr_run_id, asr_confidence, asr_checkpoint_key, origin, watch_event_id, content_title, content_background, custom_instructions, translation_mode, subtitle_format, subtitle_style_preset, subtitle_style_json, bilingual_layout, force_retranslate, status, progress, track_policy_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `)
        stmt.run(
            task.taskId,
            task.filePath,
            task.rootId || null,
            task.sourceType,
            task.trackIndex,
            task.model,
            task.targetLanguage,
            task.outputMode,
            task.stylePreset || 'default',
            task.stylePrompt || null,
            task.sourceLanguage || null,
            task.sourceSubtitlePath || null,
            task.asrRunId || null,
            task.asrConfidence ?? null,
            task.asrCheckpointKey || null,
            task.origin === 'automation' ? 'automation' : 'manual',
            task.watchEventId || null,
            task.contentTitle || null,
            task.contentBackground || null,
            task.customInstructions || null,
            task.translationMode || 'non_stream',
            task.subtitleFormat || 'srt',
            subtitleStyle?.presetId || task.subtitleStylePreset || 'bilingual_simple',
            subtitleStyle ? JSON.stringify(subtitleStyle) : null,
            task.bilingualLayout || 'translated_first',
            task.forceRetranslate ? 1 : 0,
            'queued',
            0,
            JSON.stringify(task.trackPolicy || {})
        )
        writeTaskLog(task.taskId!, 'queued', 'info', '任务已创建，等待执行')
        console.log(`[Task] 创建任务: ${task.taskId} 文件: ${task.filePath}`)
        return this.getTask(task.taskId!)
    },

    getTask(taskId: string): TranslationTask {
        const db = useDb()
        const task = db.prepare('SELECT * FROM tasks WHERE task_id = ?').get(taskId) as any
        if (!task) throw apiError(404, '任务不存在')
        const subtitleStyle = (() => {
            if (!task.subtitle_style_json) return undefined
            try { return normalizeSubtitleStyle(JSON.parse(task.subtitle_style_json), task.output_mode) } catch { return undefined }
        })()
        return {
            ...task,
            taskId: task.task_id,
            filePath: task.file_path,
            rootId: task.root_id,
            sourceType: task.source_type,
            trackIndex: task.track_index,
            targetLanguage: task.target_lang,
            outputMode: task.output_mode,
            stylePreset: task.style_preset || 'default',
            stylePrompt: task.style_prompt || '',
            sourceLanguage: task.source_lang || '',
            sourceSubtitlePath: task.source_subtitle_path || '',
            asrRunId: task.asr_run_id || undefined,
            asrConfidence: task.asr_confidence ?? undefined,
            asrCheckpointKey: task.asr_checkpoint_key || undefined,
            origin: task.origin === 'automation' ? 'automation' : 'manual',
            watchEventId: task.watch_event_id || undefined,
            contentTitle: task.content_title || '',
            contentBackground: task.content_background || '',
            customInstructions: task.custom_instructions || '',
            translationMode: task.translation_mode || 'non_stream',
            subtitleFormat: task.subtitle_format || 'srt',
            subtitleStylePreset: subtitleStyle?.presetId || task.subtitle_style_preset || 'bilingual_simple',
            subtitleStyle,
            bilingualLayout: task.bilingual_layout || 'translated_first',
            trackPolicy: (() => {
                try { return JSON.parse(task.track_policy_json || '{}') } catch { return {} }
            })(),
            forceRetranslate: !!task.force_retranslate,
            stepProgress: Number(task.step_progress || 0),
            stepMessage: task.step_message || '',
            totalChunks: task.total_chunks,
            completedChunks: task.done_chunks,
            createdAt: toUtcIsoString(task.created_at),
            updatedAt: toUtcIsoString(task.updated_at),
            startedAt: task.started_at ? toUtcIsoString(task.started_at) : undefined,
            stepStartedAt: task.step_started_at ? toUtcIsoString(task.step_started_at) : undefined,
            finishedAt: task.finished_at ? toUtcIsoString(task.finished_at) : undefined,
            pausedAt: task.paused_at ? toUtcIsoString(task.paused_at) : undefined,
            pausedTotalMs: Number(task.paused_total_ms || 0)
        }
    },

    async updateStatus(taskId: string, status: TaskStatus, progress: number, data: any = {}) {
        const db = useDb()
        const existing = db.prepare('SELECT status, progress, total_chunks, step_progress, step_message, error, started_at, step_started_at, finished_at, paused_at, paused_total_ms FROM tasks WHERE task_id = ?').get(taskId) as { status?: string, progress?: number, total_chunks?: number, step_progress?: number, step_message?: string | null, error?: string | null, started_at?: string | null, step_started_at?: string | null, finished_at?: string | null, paused_at?: string | null, paused_total_ms?: number } | undefined
        const currentStatus = String(existing?.status || '')

        if ((currentStatus === 'cancelled' || currentStatus === 'done' || currentStatus === 'error') && status !== currentStatus) {
            return
        }
        if (currentStatus === 'review' && status !== 'review' && status !== 'done') {
            return
        }
        if (currentStatus === 'paused' && !['paused', 'queued', 'cancelled', 'error', 'done'].includes(status)) {
            return
        }

        let completedChunks: number | null = Number.isFinite(Number(data.completedChunks)) ? Number(data.completedChunks) : null
        const totalChunks = Number(existing?.total_chunks || 0)
        if (status === 'done' && completedChunks === null && totalChunks > 0) {
            completedChunks = totalChunks
        }

        const sameStatus = currentStatus === status
        const requestedStepProgress = Number(data.stepProgress)
        const stepProgress = Number.isFinite(requestedStepProgress)
            ? Math.max(0, Math.min(100, Math.round(requestedStepProgress)))
            : (sameStatus ? Math.max(0, Math.min(100, Number(existing?.step_progress || 0))) : (status === 'done' ? 100 : 0))
        const stepMessage = data.stepMessage !== undefined
            ? (data.stepMessage === null ? null : String(data.stepMessage))
            : (sameStatus ? (existing?.step_message ?? null) : null)

        const nextError = data.error !== undefined
            ? (data.error == null ? null : String(data.error))
            : (existing?.error ?? null)

        const statusChanged = currentStatus !== status
        const now = new Date()
        const nowIso = now.toISOString()
        const processingStarted = !['queued', 'paused'].includes(status)
        const startedAt = existing?.started_at || (processingStarted ? nowIso : null)
        const stepStartedAt = statusChanged ? nowIso : (existing?.step_started_at || null)
        const terminalStatus = ['done', 'error', 'cancelled', 'review'].includes(status)
        const finishedAt = existing?.finished_at || (terminalStatus ? nowIso : null)
        let pausedAt = existing?.paused_at || null
        let pausedTotalMs = Number(existing?.paused_total_ms || 0)
        if (statusChanged) {
            if (status === 'paused' && currentStatus !== 'paused') {
                pausedAt = nowIso
            } else if (currentStatus === 'paused' && status !== 'paused') {
                const pauseStart = parseTimestamp(pausedAt)
                if (pauseStart) pausedTotalMs += Math.max(0, now.getTime() - pauseStart.getTime())
                pausedAt = null
            }
        }

        const stmt = db.prepare('UPDATE tasks SET status = ?, progress = ?, done_chunks = COALESCE(?, done_chunks), step_progress = ?, step_message = ?, error = ?, started_at = ?, step_started_at = ?, finished_at = ?, paused_at = ?, paused_total_ms = ?, updated_at = datetime(\'now\') WHERE task_id = ? AND status = ?')
        const info = stmt.run(status, progress, completedChunks, stepProgress, stepMessage, nextError, startedAt, stepStartedAt, finishedAt, pausedAt, pausedTotalMs, taskId, currentStatus)
        if (Number(info?.changes || 0) === 0) return

        const payload: any = {
            taskId,
            step: status,
            progress,
            ...data,
            stepProgress,
            stepMessage,
            startedAt: startedAt ? toUtcIsoString(startedAt) : null,
            stepStartedAt: stepStartedAt ? toUtcIsoString(stepStartedAt) : null,
            finishedAt: finishedAt ? toUtcIsoString(finishedAt) : null,
            pausedAt: pausedAt ? toUtcIsoString(pausedAt) : null,
            pausedTotalMs
        }

        if (data.log) {
            const level = status === 'error' ? 'error' : (data.level || 'info')
            const category = data.category || resolveTaskLogCategory(status, level, data.log)
            const logId = writeTaskLog(taskId, status, level, data.log, category)
            taskEvents.emit('progress', { ...payload, level, category, logId })
            if (status === 'done' || status === 'error' || status === 'cancelled') {
                taskEvents.emit(status, { ...payload, level, category, logId, final: true })
            }
            return
        }

        taskEvents.emit('progress', payload)
        if (status === 'done' || status === 'error' || status === 'cancelled') {
            taskEvents.emit(status, { ...payload, final: true })
        }
    },

    async process(taskId: string, openaiConfig?: { apiKey: string, baseUrl?: string }) {
        await ConfigService.cleanupLogsIfNeeded()
        assertTaskNotCancelled(taskId)
        const abortController = new AbortController()
        taskAbortControllers.set(taskId, abortController)
        markTaskActive(taskId)
        const signal = abortController.signal
        const tempDir = join(process.cwd(), 'temp')
        let taskForCleanup: TranslationTask | null = null
        let srtPath = ''
        let audioPath = ''
        let keepAsrAudio = false
        let taskSucceeded = false
        let releaseOutputLocks: (() => void) | null = null
        let runtimeConfig: { apiKey: string, baseUrl?: string } | null = openaiConfig || null

        try {
            const task = this.getTask(taskId)
            runtimeConfig = runtimeConfig || await ConfigService.getConfig()
            taskForCleanup = task
            const db = useDb()
            const config = await ConfigService.getConfig()
            const prepared = await prepareTaskSource({
                taskId,
                task,
                config,
                tempDir,
                signal,
                updateStatus: (id, status, progress, data) => this.updateStatus(id, status, progress, data)
            })
            srtPath = prepared.srtPath
            audioPath = prepared.audioPath
            let allEntries = prepared.allEntries
            const inputPath = prepared.inputPath

            const outputExt = task.subtitleFormat === 'both' ? 'ass' : (task.subtitleFormat || 'srt')
            const outputSuffix = task.outputMode === 'original' ? 'original' : String(task.targetLanguage || '')
            if (!['srt', 'ass'].includes(outputExt) || !isSafeOutputSuffix(outputSuffix)) {
                throw new Error('输出格式或目标语言不合法')
            }
            const outputBaseName = deriveOutputBaseName(task.filePath, task.sourceType)
            const embyCompatible = config.embyCompatibleOutput === true && task.sourceType !== 'external'
            const outputPath = embyCompatible
                ? join(dirname(inputPath), `${outputBaseName}.${outputExt}`)
                : join(dirname(inputPath), `${outputBaseName}.${outputSuffix}.${outputExt}`)
            const embyVariantPath = embyCompatible
                ? join(dirname(inputPath), 'SubX', `${outputBaseName}.${outputSuffix}.${outputExt}`)
                : ''
            const outputBasePath = outputPath.replace(/\.[^.]+$/, '')
            const plannedOutputPaths = task.subtitleFormat === 'both'
                ? [`${outputBasePath}.srt`, `${outputBasePath}.ass`]
                : [outputPath]
            const protectedSourcePaths = [inputPath, srtPath].filter(Boolean)
            if (plannedOutputPaths.some(candidate => protectedSourcePaths.includes(candidate))) {
                throw new Error('输出路径与源字幕文件相同，请更改目标语言或输出模式')
            }
            if (!isPathInside(prepared.rootPath, outputPath) || (embyVariantPath && !isPathInside(prepared.rootPath, embyVariantPath))) {
                throw new Error('输出路径超出媒体库范围')
            }
            releaseOutputLocks = acquireOutputLocks([outputPath, embyVariantPath].filter(Boolean))
            keepAsrAudio = Boolean(config.asrKeepAudio)

            const chunkSize = Math.min(50000, Math.max(500, config.chunkSize || 5000))
            const subtitleFormat = task.subtitleFormat || config.subtitleFormat || 'srt'
            const subtitleStylePreset = task.subtitleStylePreset || config.subtitleStylePreset || 'bilingual_simple'
            const subtitleStyle = task.subtitleStyle ? normalizeSubtitleStyle(task.subtitleStyle, task.outputMode) : undefined
            const bilingualLayout = task.bilingualLayout || config.bilingualLayout || 'translated_first'
            console.log(`[Task] Using chunk size: ${chunkSize}`)

            const initialChunks = SubtitleService.chunkByTokens(allEntries, chunkSize)
            const chunks = initialChunks
            const chunkOffsets: number[] = []
            {
                let offset = 0
                for (const chunk of chunks) {
                    chunkOffsets.push(offset)
                    offset += chunk.length
                }
            }
            const totalChunks = chunks.length
            await this.updateStatus(taskId, 'parsing', 28, {
                stepProgress: 100,
                stepMessage: `解析完成，共划分为 ${totalChunks} 个文本块`,
                log: `解析完成，共划分为 ${totalChunks} 个文本块。`
            })
            console.log(`[Task] 任务 ${taskId}: ${allEntries.length} 条字幕 → ${totalChunks} 个块 (chunkSize=${chunkSize})`)

            db.prepare('UPDATE tasks SET total_chunks = ? WHERE task_id = ?').run(totalChunks, taskId)
            task.totalChunks = totalChunks

            if (task.outputMode === 'original') {
                assertTaskNotCancelled(taskId)
                await this.updateStatus(taskId, 'translating', 80, { totalChunks, completedChunks: totalChunks, log: '已选择仅导出原字幕，跳过翻译。' })
                await this.updateStatus(taskId, 'exporting', 90, { stepProgress: 0, stepMessage: '正在导出原字幕文件...', log: '正在导出原字幕文件...' })
                assertTaskNotCancelled(taskId)
                const originalEntries = allEntries.map(entry => ({ ...entry, translatedText: entry.text }))
                const savedPath = await SubtitleService.writeSubtitle(originalEntries, outputPath, 'original', subtitleFormat as any, subtitleStylePreset, bilingualLayout as any, srtPath, subtitleStyle)
                if (embyVariantPath) {
                    await SubtitleService.writeSubtitle(originalEntries, embyVariantPath, 'original', subtitleFormat as any, subtitleStylePreset, bilingualLayout as any, srtPath, subtitleStyle)
                }
                persistReviewEntries(taskId, originalEntries, [])
                await this.updateStatus(taskId, 'exporting', 95, { stepProgress: 100, stepMessage: '文件保存成功', log: `文件保存成功: ${savedPath}` })
                db.prepare('UPDATE tasks SET output_path = ?, updated_at = datetime(\'now\') WHERE task_id = ?').run(savedPath, taskId)
                taskSucceeded = true
                await this.updateStatus(taskId, 'done', 100, { stepProgress: 100, stepMessage: '任务完成' })
                return
            }

            const translated = await translateSubtitles({
                taskId,
                task,
                config,
                runtimeConfig: runtimeConfig!,
                allEntries,
                chunks,
                chunkOffsets,
                totalChunks,
                signal,
                updateStatus: (id, status, progress, data) => this.updateStatus(id, status, progress, data)
            })

            assertTaskNotCancelled(taskId)
            const savedPath = await finalizeTaskOutput({
                taskId,
                task,
                config,
                runtimeConfig: runtimeConfig!,
                translatedEntries: translated.translatedEntries,
                outputPath,
                embyVariantPath,
                srtPath,
                subtitleFormat,
                subtitleStylePreset,
                subtitleStyle,
                bilingualLayout,
                totalChunks,
                stylePrompt: translated.stylePrompt,
                translationContext: translated.translationContext,
                fallbackCount: translated.fallbackCount,
                signal,
                updateStatus: (id, status, progress, data) => this.updateStatus(id, status, progress, data)
            })
            taskSucceeded = true

        } catch (e: any) {
            if (e instanceof TaskPausedError) {
                await this.updateStatus(taskId, 'paused', Number(taskForCleanup?.progress || 0), {
                    stepMessage: '任务已暂停，已完成识别分段已保存',
                    log: '任务已暂停，已完成识别分段已保存。',
                    level: 'warn'
                })
                return
            }
            if (e instanceof TaskCancelledError || isTaskCancelled(taskId)) {
                await this.updateStatus(taskId, 'cancelled', Number(taskForCleanup?.progress || 0), {
                    error: '用户取消任务',
                    stepMessage: '任务已取消',
                    log: '任务已取消，后台执行已停止。',
                    level: 'warn'
                })
                return
            }

            const message = e?.message || 'Unknown error'
            const safeMessage = runtimeConfig?.apiKey ? message.split(runtimeConfig.apiKey).join('***') : message
            const safeStack = runtimeConfig?.apiKey && e?.stack ? String(e.stack).split(runtimeConfig.apiKey).join('***') : String(e?.stack || '')
            const classified = classifyTaskError(safeMessage)
            logger.error({
                taskId,
                baseUrl: runtimeConfig?.baseUrl || 'https://api.openai.com/v1',
                model: taskForCleanup?.model || 'unknown',
                targetLanguage: taskForCleanup?.targetLanguage || 'unknown',
                apiKeyConfigured: Boolean(runtimeConfig?.apiKey),
                responseStatus: e?.response?.status,
                err: {
                    name: e?.name || 'Error',
                    message: safeMessage,
                    code: e?.code,
                    status: e?.status || e?.response?.status,
                    stack: safeStack.split('\n').slice(0, 5).join('\n')
                }
            }, 'task failed')

            await this.updateStatus(taskId, 'error', Number(taskForCleanup?.progress || 0), {
                error: `${classified.summary} (${safeMessage})`,
                stepMessage: classified.summary,
                log: `!!! 任务失败: ${classified.summary}${safeStack ? '\n堆栈信息: ' + safeStack.split('\n').slice(0, 3).join('\n') : ''}`
            })
        } finally {
            releaseOutputLocks?.()
            cancelledTaskIds.delete(taskId)
            taskAbortControllers.delete(taskId)
            unmarkTaskActive(taskId)
            if (audioPath) releaseAudioLease(audioPath)
            if (taskForCleanup?.sourceType === 'embedded' && srtPath && existsSync(srtPath)) {
                try {
                    rmSync(srtPath, { force: true })
                    console.log(`[Task] Cleaned up temp file: ${srtPath}`)
                } catch (err) {
                    console.error(`[Task] Failed to clean up temp file: ${srtPath}`, err)
                }
            }
            if (audioPath && existsSync(audioPath) && taskSucceeded && !keepAsrAudio) {
                removeCachedAudio(audioPath)
                console.log(`[Task] Removed cached ASR audio: ${audioPath}`)
            }
            try {
                TranslationService.cleanupPartialFiles(taskId, Number(taskForCleanup?.totalChunks || 0) + 1)
            } catch { /* ignore cleanup failures */ }
        }
    }
}

export const globalTaskQueue = new TaskQueue({
  getTask: (taskId) => TaskService.getTask(taskId),
  process: (taskId, config) => TaskService.process(taskId, config)
})
