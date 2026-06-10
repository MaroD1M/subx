import OpenAI from 'openai'
import pLimit from 'p-limit'
import { join, dirname, basename } from 'path'
import { existsSync, mkdirSync, rmSync, appendFileSync } from 'fs'
import { EventEmitter } from 'events'
import { useDb } from './db'
import { VideoService } from './video'
import { SubtitleService } from './subtitle'
import { getMediaRoot, resolveMediaPath } from './mediaRoots'
import { TranslationService } from './translation'
import { ConfigService } from './config'
import { classifyTaskError } from './taskError'
import { STYLE_PRESETS } from '~~/shared/stylePresets'
import type { TranslationTask, SubtitleEntry, TaskStatus } from '~~/types'

export const taskEvents = new EventEmitter()
const cancelledTaskIds = new Set<string>()
const taskAbortControllers = new Map<string, AbortController>()

class TaskCancelledError extends Error {
    constructor(message = '任务已取消') {
        super(message)
        this.name = 'TaskCancelledError'
    }
}

function isTaskCancelled(taskId: string) {
    return cancelledTaskIds.has(taskId)
}

function assertTaskNotCancelled(taskId: string) {
    if (isTaskCancelled(taskId)) {
        throw new TaskCancelledError()
    }
}

type TaskLogCategory = 'system' | 'translation' | 'export' | 'error' | 'process'

type ChunkRiskProfile = {
    tags: string[]
    stylePromptSuffix?: string
}

type ChunkDiagnostics = {
    chunkIndex: number
    initialSize: number
    retryAttempts: number
    validationFailures: number
    singleRetryAttempts: number
    singleRetrySuccesses: number
    singleRetryFailures: number
    fallbackCount: number
    missingIds: string[]
    contaminatedIds: string[]
    reviewIds: string[]
    finalStatus: 'ok' | 'partial' | 'fallback' | 'review'
}

function resolveLogCategory(step: string | null, level: 'info' | 'error' | 'warn', message: string): TaskLogCategory {
    if (level === 'error' || step === 'error' || /失败|错误|异常|取消|error/i.test(message)) return 'error'
    if (step === 'exporting' || /导出|保存|输出文件/i.test(message)) return 'export'
    if (step === 'translating' || /翻译|文本块|chunk|tokens|模型|术语表|风格/i.test(message)) return 'translation'
    if (step === 'queued' || step === 'extracting' || step === 'parsing' || /提取|解析|SRT|字幕|初始化|队列|创建/i.test(message)) return 'system'
    return 'process'
}

function writeTaskLog(taskId: string, step: string | null, level: 'info' | 'error' | 'warn', message: string, category?: TaskLogCategory) {
    if (isTaskCancelled(taskId) && step !== 'cancelled' && step !== 'error') {
        return
    }
    const db = useDb()
    const resolvedCategory = category || resolveLogCategory(step, level, message)
    db.prepare("INSERT INTO task_logs (task_id, step, category, level, message, created_at) VALUES (?, ?, ?, ?, ?, datetime('now'))")
        .run(taskId, step, resolvedCategory, level, message)

    try {
        const logFile = join(process.cwd(), 'db', 'logs', `task_${taskId}.log`)
        const dir = join(process.cwd(), 'db', 'logs')
        if (!existsSync(dir)) { mkdirSync(dir, { recursive: true }) }
        const ts = new Date().toISOString().replace('T', ' ').substring(0, 19)
        appendFileSync(logFile, `[${ts}] [${level.toUpperCase()}] [${step || '-'}] ${message}\n`)
    } catch {}
}

function isTerminalStatus(status?: string | null) {
    return ['done', 'error', 'review', 'cancelled'].includes(String(status || ''))
}

class TaskQueue {
    private queue: { taskId: string, openaiConfig: any, resolve: (value: void) => void, reject: (reason: any) => void }[] = [];
    private active = 0;

    async add(taskId: string, openaiConfig: any): Promise<void> {
        return new Promise((resolve, reject) => {
            cancelledTaskIds.delete(taskId)
            this.queue.push({ taskId, openaiConfig, resolve, reject });
            this.next();
        });
    }

    cancel(taskId: string) {
        cancelledTaskIds.add(taskId)
        taskAbortControllers.get(taskId)?.abort()

        let removed = false
        const remainingQueue: typeof this.queue = []

        for (const task of this.queue) {
            if (task.taskId === taskId) {
                removed = true
                task.resolve()
                continue
            }
            remainingQueue.push(task)
        }

        this.queue = remainingQueue
        return removed
    }

    private async next() {
        const config = await ConfigService.getConfig();
        const concurrency = Math.max(1, Number(config.concurrency) || 3);

        while (this.active < concurrency && this.queue.length > 0) {
            const taskArgs = this.queue.shift();
            if (taskArgs) {
                if (isTaskCancelled(taskArgs.taskId)) {
                    taskArgs.resolve()
                    continue
                }

                const currentTask = TaskService.getTask(taskArgs.taskId)
                if (isTerminalStatus(currentTask?.status)) {
                    taskArgs.resolve()
                    continue
                }

                this.active++;
                TaskService.process(taskArgs.taskId, taskArgs.openaiConfig)
                    .then(taskArgs.resolve)
                    .catch(taskArgs.reject)
                    .finally(() => {
                        this.active--;
                        this.next();
                    });
            }
        }
    }
}

export const globalTaskQueue = new TaskQueue()

function expandRetryEntries(entries: SubtitleEntry[], targetIds: string[]) {
    if (!targetIds.length) return entries

    const idSet = new Set(targetIds.map(id => String(id)))
    const expandedIds = new Set<string>()
    const targetIndexes: number[] = []

    entries.forEach((entry, index) => {
        const currentId = String(entry.id)
        if (!idSet.has(currentId)) return

        targetIndexes.push(index)

        expandedIds.add(currentId)
        if (index > 0) expandedIds.add(String(entries[index - 1]!.id))
        if (index + 1 < entries.length) expandedIds.add(String(entries[index + 1]!.id))
    })

    if (targetIndexes.length >= 2) {
        const minIndex = Math.max(0, Math.min(...targetIndexes) - 1)
        const maxIndex = Math.min(entries.length - 1, Math.max(...targetIndexes) + 1)

        for (let index = minIndex; index <= maxIndex; index++) {
            expandedIds.add(String(entries[index]!.id))
        }
    }

    return entries.filter(entry => expandedIds.has(String(entry.id)))
}


async function translateChunkWithRetry(
    openai: OpenAI,
    chunk: SubtitleEntry[],
    targetLanguage: string,
    glossary: Record<string, string>,
    previousContext: SubtitleEntry[],
    model: string,
    taskId: string,
    chunkIndex: number,
    stylePrompt: string,
    maxRetries: number,
    callbacks?: { onEntryTranslated?: (entry: { id: string; translatedText: string }) => void },
    streamUsage: boolean = false,
    useStreaming: boolean = false,
    logLabel?: string,
    signal?: AbortSignal
): Promise<{ entries: SubtitleEntry[], diagnostics: ChunkDiagnostics }> {
    const finalResults = new Map<string, SubtitleEntry>()
    let unresolvedEntries = [...chunk]
    const chunkLabel = logLabel || ('块 #' + (chunkIndex + 1))
    const diagnostics: ChunkDiagnostics = {
        chunkIndex,
        initialSize: chunk.length,
        retryAttempts: 0,
        validationFailures: 0,
        singleRetryAttempts: 0,
        singleRetrySuccesses: 0,
        singleRetryFailures: 0,
        fallbackCount: 0,
        missingIds: [],
        contaminatedIds: [],
        reviewIds: [],
        finalStatus: 'ok'
    }

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        assertTaskNotCancelled(taskId)
        if (unresolvedEntries.length === 0) break

        if (attempt > 0) {
            diagnostics.retryAttempts = Math.max(diagnostics.retryAttempts, attempt)
            console.log(`[Retry] Task ${taskId} chunk ${chunkIndex}: 正在进行第 ${attempt}/${maxRetries} 次增量重试，剩余 ${unresolvedEntries.length} 条待处理`)
            writeTaskLog(taskId, 'translating', 'warn', '[重试] ' + chunkLabel + ' 第 ' + attempt + '/' + maxRetries + ' 次重试，仅补译剩余 ' + unresolvedEntries.length + ' 条')
            await new Promise(resolve => setTimeout(resolve, 1000 * attempt))
        }

        try {
            const results = await TranslationService.translateChunk(
                openai, unresolvedEntries, targetLanguage, glossary, previousContext, model, taskId, chunkIndex, stylePrompt, callbacks, streamUsage, attempt, useStreaming, signal
            )
            assertTaskNotCancelled(taskId)

            const expectedCount = unresolvedEntries.length
            const returnedIds = new Set<string>()
            const acceptedIds = new Set<string>()
            for (const entry of results) {
                const id = String(entry.id)
                const translatedText = String(entry.translatedText || '')
                const accepted = translatedText && translatedText !== String(entry.text || '')
                if (accepted) {
                    returnedIds.add(id)
                    finalResults.set(id, entry)
                    acceptedIds.add(id)
                }
            }

            const missingIds = unresolvedEntries
                .map(entry => String(entry.id))
                .filter(id => !returnedIds.has(id))
            const unresolvedIds = unresolvedEntries
                .map(entry => String(entry.id))
                .filter(id => !finalResults.has(id))

            if (unresolvedIds.length === 0) {
                unresolvedEntries = []
                break
            }

            const retryIds = Array.from(new Set([...unresolvedIds, ...expandRetryEntries(unresolvedEntries, missingIds).map(entry => String(entry.id))]))
            unresolvedEntries = unresolvedEntries.filter(entry => retryIds.includes(String(entry.id)))

            if (unresolvedEntries.length === 0) {
                break
            }

            const acceptedCount = expectedCount - unresolvedEntries.length
            const contaminatedIds = results
                .filter(entry => SubtitleService.isLikelyContaminatedTranslation(String(entry.text || ''), String(entry.translatedText || '')))
                .map(entry => String(entry.id))
            diagnostics.validationFailures++
            diagnostics.missingIds = Array.from(new Set([...diagnostics.missingIds, ...missingIds])).slice(0, 20)
            diagnostics.contaminatedIds = Array.from(new Set([...diagnostics.contaminatedIds, ...contaminatedIds])).slice(0, 20)
            const missingSuffix = missingIds.length > 0 ? `，缺失 ID: ${missingIds.join(', ')}` : ''
            const contaminationSuffix = contaminatedIds.length > 0 ? `，疑似串条 ID: ${contaminatedIds.join(', ')}` : ''
            writeTaskLog(
                taskId,
                'translating',
                'warn',
                '[校验] ' + chunkLabel + ' AI 返回 ' + results.length + '/' + expectedCount + '，有效 ' + acceptedCount + '/' + expectedCount + '，待处理 ' + unresolvedEntries.length + ' 条' + missingSuffix + contaminationSuffix
            )

            if (acceptedCount === 0) {
                const sampleIds = results.slice(0, 3).map(entry => `#${entry.id} "${String(entry.text || '').substring(0, 30)}" → "${String(entry.translatedText || '').substring(0, 30)}"`)
                writeTaskLog(taskId, 'translating', 'warn', `[解析内容] ${chunkLabel} 已匹配全部 ID 但翻译均未通过校验(有效 ${acceptedCount}/${expectedCount})，示例: ${sampleIds.join(' | ')}`)

                const diagLines: string[] = []
                results.forEach(entry => {
                    const orig = String(entry.text || '')
                    const trans = String(entry.translatedText || '')
                    const same = trans === orig ? 'SAME' : 'DIFF'
                    const empty = !trans ? 'EMPTY' : ''
                    const flag = empty || same
                    if (flag) diagLines.push(`#${entry.id} ${flag} orig="${orig}" trans="${trans}"`)
                })
                if (diagLines.length > 0) {
                    writeTaskLog(taskId, 'translating', 'error', `[诊断] ${chunkLabel} 全部被拒详情:\n${diagLines.join('\n')}`)
                }

                console.log(`[REJECTED ALL] taskId=${taskId} chunk=${chunkIndex} attempt=${attempt} entries=${results.length} accepted=0`)
                results.slice(0, 5).forEach(entry => {
                    const eid = entry.id
                    const orig = String(entry.text || '')
                    const trans = String(entry.translatedText || '')
                    console.log(`  #${eid} orig="${orig.substring(0, 40)}" | trans="${trans.substring(0, 40)}" | same=${trans === orig} | transTruthy=${!!trans}`)
                })
                if (attempt >= 2) {
                    writeTaskLog(taskId, 'translating', 'warn', '[止损] ' + chunkLabel + ' 连续 ' + (attempt + 1) + ' 次尝试均无有效翻译，停止整块重试并转入更细粒度补译')
                    break
                }
            }
        } catch (e: any) {
            console.error(`[Retry] Task ${taskId} chunk ${chunkIndex} 尝试失败:`, e.message)
            const detail = String(e?.message || 'unknown')
            const reason = detail.includes('[条目缺失]') ? '返回缺条' : detail.includes('[解析为空]') ? '空响应/格式异常' : detail.includes('[疑似拒答]') ? '疑似拒答/过滤' : detail.includes('[无有效译文]') ? '无有效译文' : '请求失败'

            if (Array.isArray(e?.partialResults) && e.partialResults.length > 0) {
                for (const entry of e.partialResults) {
                    const id = String(entry.id)
                    const translatedText = String(entry.translatedText || '')
                    if (translatedText && translatedText !== String(entry.text || '')) {
                        finalResults.set(id, entry)
                    }
                }

                const missingIds = (Array.isArray(e?.missingIds) ? e.missingIds : []).map((id: any) => String(id))
                const expandedRetryIds = new Set(expandRetryEntries(unresolvedEntries, missingIds).map(entry => String(entry.id)))
                unresolvedEntries = unresolvedEntries.filter(entry => expandedRetryIds.has(String(entry.id)))
                diagnostics.validationFailures++
                diagnostics.missingIds = Array.from(new Set([...diagnostics.missingIds, ...missingIds])).slice(0, 20)

                writeTaskLog(
                    taskId,
                    'translating',
                    'warn',
                    `[重试失败] 块 #${chunkIndex + 1} 第 ${attempt + 1} 次尝试失败（${reason}）：${detail}；已保留 ${e.partialResults.length} 条有效结果，回炉 ${unresolvedEntries.length} 条（含相邻疑似串条）`
                )
                continue
            }

            writeTaskLog(taskId, 'translating', 'warn', `[重试失败] 块 #${chunkIndex + 1} 第 ${attempt + 1} 次尝试失败（${reason}）：${detail}`)
        }
    }

    if (unresolvedEntries.length > 0) {
        const ids = unresolvedEntries.map(entry => `#${entry.id}`).join(', ')
        console.warn(`[Task] Task ${taskId} chunk ${chunkIndex}: 重试后仍有 ${unresolvedEntries.length} 条待处理，将回退为原文待人工核对。`)
        writeTaskLog(taskId, 'translating', 'warn', `[降级] 块 #${chunkIndex + 1} ${unresolvedEntries.length} 条未成功翻译，已回退原文，可在核对页手动处理：${ids}`)
        for (const entry of unresolvedEntries) {
            finalResults.set(String(entry.id), { ...entry, translatedText: entry.text })
        }
    }

    const stillMissing = chunk.filter(entry => !finalResults.has(String(entry.id)))
    if (stillMissing.length > 0) {
        const ids = stillMissing.map(entry => `#${entry.id}`).join(', ')
        diagnostics.missingIds = Array.from(new Set([...diagnostics.missingIds, ...stillMissing.map(entry => String(entry.id))])).slice(0, 20)
        diagnostics.fallbackCount = stillMissing.length
        diagnostics.finalStatus = 'fallback'
        for (const entry of stillMissing) {
            finalResults.set(String(entry.id), { ...entry, translatedText: entry.text })
        }
        console.warn(`[Task] Task ${taskId} chunk ${chunkIndex}: 仍有 ${stillMissing.length} 条缺失，已回退为原文。`)
        writeTaskLog(taskId, 'translating', 'warn', `[降级] 块 #${chunkIndex + 1} ${stillMissing.length} 条未成功翻译，已回退原文：${ids}`)
    } else if (diagnostics.validationFailures > 0 || diagnostics.singleRetryAttempts > 0) {
        diagnostics.finalStatus = 'partial'
    }

    return {
        entries: chunk.map(entry => {
            const translated = finalResults.get(String(entry.id))
            if (translated) return translated
            return { ...entry, translatedText: entry.text }
        }),
        diagnostics
    }
}


function mapReviewStatus(entry: SubtitleEntry, issuesById: Map<string, Array<{ reason: string, severity?: 'soft' | 'hard' }>>) {
    const issueList = issuesById.get(String(entry.id)) || []
    const reviewReasons = issueList.map(issue => issue.reason)
    const translated = String(entry.translatedText || '')
    const original = String(entry.text || '')
    const normalizedTranslated = SubtitleService.normalizeComparisonText(translated)
    const normalizedOriginal = SubtitleService.normalizeComparisonText(original)

    if (!normalizedTranslated) {
        return { reviewStatus: 'missing', reviewReasons }
    }
    if (issueList.some(issue => issue.reason === 'same_as_source')) {
        return { reviewStatus: 'fallback_original', reviewReasons }
    }
    if (normalizedOriginal && normalizedOriginal === normalizedTranslated) {
        return { reviewStatus: 'accepted_same', reviewReasons }
    }
    if (issueList.length > 0) {
        return { reviewStatus: 'needs_review', reviewReasons }
    }
    return { reviewStatus: 'translated', reviewReasons }
}

function persistReviewEntries(taskId: string, entries: SubtitleEntry[], issues: Array<{ id: string, reason: string, severity?: 'soft' | 'hard' }>) {
    const db = useDb()
    const issueMap = new Map<string, Array<{ reason: string, severity?: 'soft' | 'hard' }>>()
    for (const issue of issues) {
        const list = issueMap.get(String(issue.id)) || []
        list.push(issue)
        issueMap.set(String(issue.id), list)
    }

    const stmt = db.prepare(`
      INSERT INTO task_review_entries (
        task_id, subtitle_id, start_time, end_time, original_text, translated_text, final_text, review_status, review_reasons, selected, edited, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, datetime('now'), datetime('now'))
      ON CONFLICT(task_id, subtitle_id) DO UPDATE SET
        start_time=excluded.start_time,
        end_time=excluded.end_time,
        original_text=excluded.original_text,
        translated_text=excluded.translated_text,
        final_text=excluded.final_text,
        review_status=excluded.review_status,
        review_reasons=excluded.review_reasons,
        updated_at=datetime('now')
    `)

    for (const entry of entries) {
        const review = mapReviewStatus(entry, issueMap)
        stmt.run(
            taskId,
            String(entry.id),
            String(entry.startTime || ''),
            String(entry.endTime || ''),
            String(entry.text || ''),
            String(entry.translatedText || ''),
            String(entry.translatedText || entry.text || ''),
            review.reviewStatus,
            JSON.stringify(review.reviewReasons || [])
        )
    }
}


function analyzeChunkRisk(entries: SubtitleEntry[]): ChunkRiskProfile {
    const tags = new Set<string>()

    for (const entry of entries) {
        const text = String(entry.text || '')
        const normalized = SubtitleService.normalizeSubtitleText(text)
        const lines = normalized.split('\n').map(line => line.trim()).filter(Boolean)

        if (SubtitleService.isLikelySongLyric(text)) {
            tags.add('lyrics')
        }
        if (lines.length > 0 && lines.every(line => /^[\[(（【].*[\])）】]$/.test(line))) {
            tags.add('non_dialogue')
        }
        if (normalized.includes('__SUBX_FMT_')) {
            tags.add('formatting_tokens')
        }
        if (lines.length >= 2 && lines.some(line => /[\u4e00-\u9fff]/.test(line)) && lines.some(line => /[A-Za-z]/.test(line))) {
            tags.add('bilingual_source')
        }
        if (lines.length >= 3) {
            tags.add('multi_line_dialogue')
        }
        if (normalized.length >= 120) {
            tags.add('long_text')
        }
    }

    const styleHints: string[] = []
    if (tags.has('lyrics')) styleHints.push('当前块疑似歌词，请保留歌词节奏与换行，不要省略短句，不要把多行歌词合并成一行。')
    if (tags.has('non_dialogue')) styleHints.push('当前块包含环境音/旁白括号描述，请保留括号结构并进行简洁汉化。')
    if (tags.has('bilingual_source')) styleHints.push('当前块疑似已含双语源字幕，请只翻译原语言内容，避免重复拼接双语。')
    if (tags.has('formatting_tokens')) styleHints.push('当前块包含格式占位符，必须严格保留所有 __SUBX_FMT_n__ 占位符及顺序。')

    return {
        tags: Array.from(tags),
        stylePromptSuffix: styleHints.length ? styleHints.join('\n') : undefined
    }
}

export const TaskService = {
    async createTask(task: Partial<TranslationTask>): Promise<TranslationTask> {
        const db = useDb()
        const stmt = db.prepare(`
      INSERT INTO tasks (
        task_id, file_path, root_id, source_type, track_index, model, target_lang, output_mode, style_preset, translation_mode, subtitle_format, subtitle_style_preset, bilingual_layout, force_retranslate, status, progress, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
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
            task.translationMode || 'non_stream',
            task.subtitleFormat || 'srt',
            task.subtitleStylePreset || 'bilingual_simple',
            task.bilingualLayout || 'translated_first',
            task.forceRetranslate ? 1 : 0,
            'queued',
            0
        )
        writeTaskLog(task.taskId!, 'queued', 'info', '任务已创建，等待执行')
        console.log(`[Task] 创建任务: ${task.taskId} 文件: ${task.filePath}`)
        return this.getTask(task.taskId!)
    },

    getTask(taskId: string): TranslationTask {
        const db = useDb()
        const task = db.prepare('SELECT * FROM tasks WHERE task_id = ?').get(taskId) as any
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
            translationMode: task.translation_mode || 'non_stream',
            subtitleFormat: task.subtitle_format || 'srt',
            subtitleStylePreset: task.subtitle_style_preset || 'bilingual_simple',
            bilingualLayout: task.bilingual_layout || 'translated_first',
            forceRetranslate: !!task.force_retranslate,
            totalChunks: task.total_chunks,
            completedChunks: task.done_chunks,
            createdAt: task.created_at,
            updatedAt: task.updated_at
        }
    },

    async updateStatus(taskId: string, status: TaskStatus, progress: number, data: any = {}) {
        const db = useDb()
        const existing = db.prepare('SELECT status FROM tasks WHERE task_id = ?').get(taskId) as { status?: string } | undefined
        const currentStatus = String(existing?.status || '')

        if ((currentStatus === 'cancelled' && status !== 'cancelled') || (currentStatus === 'review' && status !== 'review')) {
            return
        }

        const stmt = db.prepare('UPDATE tasks SET status = ?, progress = ?, updated_at = datetime(\'now\') WHERE task_id = ?')
        stmt.run(status, progress, taskId)

        if (data.log) {
            const level = status === 'error' ? 'error' : (data.level || 'info')
            const category = data.category || resolveLogCategory(status, level, data.log)
            writeTaskLog(taskId, status, level, data.log, category)
            taskEvents.emit('progress', { taskId, step: status, progress, ...data, level, category })
            if (status === 'done' || status === 'error' || status === 'cancelled') {
                taskEvents.emit(status, { taskId, step: status, progress, ...data, level, category, final: true })
            }
            return
        }

        taskEvents.emit('progress', { taskId, step: status, progress, ...data })
        if (status === 'done' || status === 'error' || status === 'cancelled') {
            taskEvents.emit(status, { taskId, step: status, progress, ...data, final: true })
        }
    },

    async process(taskId: string, openaiConfig: { apiKey: string, baseUrl?: string }) {
        await ConfigService.cleanupLogsIfNeeded()
        assertTaskNotCancelled(taskId)
        const abortController = new AbortController()
        taskAbortControllers.set(taskId, abortController)
        const signal = abortController.signal
        const task = this.getTask(taskId)
        const root = await getMediaRoot(task.rootId)
        const videoDir = root.path
        const tempDir = join(process.cwd(), 'temp')

        if (!existsSync(tempDir)) {
            mkdirSync(tempDir, { recursive: true })
        }

        const srtPath = task.sourceType === 'external'
            ? await resolveMediaPath(task.filePath, task.rootId)
            : join(tempDir, `${taskId}.srt`)
        const baseName = task.filePath.replace(/\.[^.]+$/, '')
        const cleanName = baseName.replace(/\.[a-zA-Z]{2,}(-[a-zA-Z]{2,})?$/, '')
        const outputExt = task.subtitleFormat === 'both' ? 'ass' : (task.subtitleFormat || 'srt')
        const outputSuffix = task.outputMode === 'original' ? 'original' : task.targetLanguage
        const inputPath = await resolveMediaPath(task.filePath, task.rootId)
        const outputBaseName = basename(cleanName)
        const outputPath = join(dirname(inputPath), `${outputBaseName}.${outputSuffix}.${outputExt}`)

        try {
            assertTaskNotCancelled(taskId)
            await this.updateStatus(taskId, 'extracting', 10, { log: '正在从原视频中提取字幕流...' })
            if (task.sourceType === 'embedded') {
                assertTaskNotCancelled(taskId)
                await VideoService.extractSubtitle(task.filePath, task.trackIndex!, srtPath, task.rootId)
                await this.updateStatus(taskId, 'extracting', 15, { log: '字幕提取成功，保存至临时文件。' })
            } else {
                await this.updateStatus(taskId, 'extracting', 15, { log: '使用外部字幕文件。' })
            }

            assertTaskNotCancelled(taskId)
            await this.updateStatus(taskId, 'parsing', 20, { log: '正在解析 SRT 并进行智能分块...' })
            const allEntries = await SubtitleService.parseSubtitle(srtPath)

            const config = await ConfigService.getConfig()
            const chunkSize = Math.max(500, config.chunkSize || 5000)
            const subtitleFormat = task.subtitleFormat || config.subtitleFormat || 'srt'
            const subtitleStylePreset = task.subtitleStylePreset || config.subtitleStylePreset || 'bilingual_simple'
            const bilingualLayout = task.bilingualLayout || config.bilingualLayout || 'translated_first'
            console.log(`[Task] Using chunk size: ${chunkSize}`)

            const initialChunks = SubtitleService.chunkByTokens(allEntries, chunkSize)
            const chunks = initialChunks
            const totalChunks = chunks.length
            await this.updateStatus(taskId, 'parsing', 25, { log: `解析完成，共划分为 ${totalChunks} 个文本块。` })
            console.log(`[Task] 任务 ${taskId}: ${allEntries.length} 条字幕 → ${totalChunks} 个块 (chunkSize=${chunkSize})`)

            const db = useDb()
            db.prepare('UPDATE tasks SET total_chunks = ? WHERE task_id = ?').run(totalChunks, taskId)

            if (task.outputMode === 'original') {
                assertTaskNotCancelled(taskId)
                await this.updateStatus(taskId, 'translating', 80, { totalChunks, completedChunks: totalChunks, log: '已选择仅导出原字幕，跳过翻译。' })
                await this.updateStatus(taskId, 'exporting', 90, { log: '正在导出原字幕文件...' })
                assertTaskNotCancelled(taskId)
                const originalEntries = allEntries.map(entry => ({ ...entry, translatedText: entry.text }))
                const savedPath = await SubtitleService.writeSubtitle(originalEntries, outputPath, 'original', subtitleFormat, subtitleStylePreset, bilingualLayout, srtPath)
                await this.updateStatus(taskId, 'exporting', 95, { log: `文件保存成功: ${savedPath}` })
                await this.updateStatus(taskId, 'done', 100)
                db.prepare('UPDATE tasks SET status = \'done\', progress = 100, output_path = ?, updated_at = datetime(\'now\') WHERE task_id = ?')
                    .run(savedPath, taskId)
                return
            }

            await this.updateStatus(taskId, 'translating', 30, { totalChunks, completedChunks: 0 })

            const openai = new OpenAI({ apiKey: openaiConfig.apiKey, baseURL: openaiConfig.baseUrl })
            const limit = pLimit(1)
            const maxRetries = config.maxRetries || 3

            const glossary = config.glossary || {}

            const stylePresetConfig = STYLE_PRESETS.find(s => s.id === task.stylePreset)
            const stylePrompt = stylePresetConfig?.prompt || ''
            if (stylePrompt) {
                await this.updateStatus(taskId, 'translating', 30, { log: `使用翻译风格预设: ${stylePresetConfig!.name}` })
            }
            if (task.forceRetranslate) {
                await this.updateStatus(taskId, 'translating', 30, { log: '已启用重新翻译：本次任务将跳过本地缓存。' })
            }

            const translatedMap = new Map<string, SubtitleEntry>()
            const completedChunksPerChunk = new Map<number, number>()
            let globalCompletedChunks = 0

            const updateGlobalProgress = () => {
                globalCompletedChunks = 0
                for (const count of completedChunksPerChunk.values()) {
                    globalCompletedChunks += count > 0 ? 1 : 0
                }
                const progress = 30 + Math.floor((globalCompletedChunks / totalChunks) * 60)
                this.updateStatus(taskId, 'translating', progress, {
                    totalChunks,
                    completedChunks: globalCompletedChunks,
                    currentText: `翻译进度: ${globalCompletedChunks}/${totalChunks}`
                })
            }

            const promises = chunks.map((chunk, index) => limit(async () => {
                assertTaskNotCancelled(taskId)
                const previousContext = index > 0 && chunks[index - 1]
                    ? chunks[index - 1]!.slice(-5).map(e => {
                        const translated = translatedMap.get(String(e.id))
                        return translated || e
                    })
                    : []

                const uncachedEntries: SubtitleEntry[] = []
                const cachedResults = new Map<string, string>()
                const nonVerbalResults = new Map<string, string>()

                const shouldUseCache = !task.forceRetranslate
                for (const entry of chunk) {
                    if (SubtitleService.isNonVerbal(entry.text)) {
                        nonVerbalResults.set(String(entry.id), entry.text)
                        continue
                    }

                    const sourceText = entry.text
                    if (!shouldUseCache) {
                        uncachedEntries.push(entry)
                        continue
                    }
                    const cacheHash = SubtitleService.computeCacheHash(sourceText, task.model, task.targetLanguage)
                    const cached = SubtitleService.getCachedTranslation(cacheHash)
                    if (cached) {
                        cachedResults.set(String(entry.id), cached)
                    } else {
                        uncachedEntries.push(entry)
                    }
                }

                if (cachedResults.size > 0 || nonVerbalResults.size > 0) {
                    console.log(`[Cache] Chunk ${index}: ${cachedResults.size} from cache, ${nonVerbalResults.size} non-verbal skipped, ${uncachedEntries.length} to translate`)
                }

                let translatedChunk: SubtitleEntry[]
                const diagnosticsCollection: ChunkDiagnostics[] = []

                if (uncachedEntries.length === 0) {
                    translatedChunk = chunk.map(entry => {
                        const cachedText = cachedResults.get(String(entry.id))
                        if (cachedText) {
                            return { ...entry, translatedText: cachedText }
                        }
                        const nonVerbalText = nonVerbalResults.get(String(entry.id))
                        if (nonVerbalText) {
                            return { ...entry, translatedText: nonVerbalText }
                        }
                        return entry
                    })
                } else {
                    const chunkRisk = analyzeChunkRisk(uncachedEntries)
                    const effectiveStylePrompt = [stylePrompt, chunkRisk.stylePromptSuffix].filter(Boolean).join('\n\n')
                    const stablePreviousContext: SubtitleEntry[] = []

                    const idMapping = new Map<string, string>()
                    const remappedChunk: SubtitleEntry[] = uncachedEntries.map((entry, i) => {
                        const sequentialId = String(i + 1)
                        idMapping.set(sequentialId, String(entry.id))
                        return { ...entry, id: sequentialId }
                    })

                    const chunkResult = await translateChunkWithRetry(
                        openai, remappedChunk, task.targetLanguage, glossary,
                        stablePreviousContext, task.model, taskId, index,
                        effectiveStylePrompt, maxRetries,
                        undefined,
                        (config.translationMode === 'stream') && (config.streamUsage || false),
                        config.translationMode === 'stream',
                        '块 #' + (index + 1),
                        signal
                    )

                    diagnosticsCollection.push(chunkResult.diagnostics)
                    const allowCache = chunkResult.diagnostics.validationFailures === 0
                        && chunkResult.diagnostics.singleRetryAttempts === 0
                        && chunkResult.diagnostics.fallbackCount === 0

                    const aiResultByOriginalId = new Map<string, SubtitleEntry>()
                    for (const entry of chunkResult.entries) {
                        const originalId = idMapping.get(String(entry.id))
                        if (!originalId) continue
                        const originalEntry = uncachedEntries.find(e => String(e.id) === originalId)
                        if (!originalEntry) continue

                        const restoredEntry: SubtitleEntry = {
                            ...originalEntry,
                            id: originalId,
                            translatedText: entry.translatedText
                        }
                        aiResultByOriginalId.set(originalId, restoredEntry)

                        if (allowCache && entry.translatedText
                            && entry.translatedText !== originalEntry.text
                            && !SubtitleService.isNonVerbal(originalEntry.text)
                        ) {
                            const cacheHash = SubtitleService.computeCacheHash(originalEntry.text, task.model, task.targetLanguage)
                            SubtitleService.setCachedTranslation(cacheHash, originalEntry.text, entry.translatedText, task.model, task.targetLanguage)
                        }
                    }

                    try {
                        const responseRow = db.prepare('SELECT id, response_meta FROM task_responses WHERE task_id = ? AND chunk_index = ? ORDER BY id DESC LIMIT 1').get(taskId, index) as { id?: number, response_meta?: string } | undefined
                        if (responseRow?.id) {
                            const currentMeta = responseRow.response_meta ? JSON.parse(String(responseRow.response_meta)) : {}
                            const combinedDiagnostics = diagnosticsCollection.length <= 1
                                ? diagnosticsCollection[0]
                                : {
                                    chunkIndex: index,
                                    initialSize: uncachedEntries.length,
                                    retryAttempts: diagnosticsCollection.reduce((sum, item) => sum + Number(item?.retryAttempts || 0), 0),
                                    validationFailures: diagnosticsCollection.reduce((sum, item) => sum + Number(item?.validationFailures || 0), 0),
                                    singleRetryAttempts: diagnosticsCollection.reduce((sum, item) => sum + Number(item?.singleRetryAttempts || 0), 0),
                                    singleRetrySuccesses: diagnosticsCollection.reduce((sum, item) => sum + Number(item?.singleRetrySuccesses || 0), 0),
                                    singleRetryFailures: diagnosticsCollection.reduce((sum, item) => sum + Number(item?.singleRetryFailures || 0), 0),
                                    fallbackCount: diagnosticsCollection.reduce((sum, item) => sum + Number(item?.fallbackCount || 0), 0),
                                    missingIds: Array.from(new Set(diagnosticsCollection.flatMap(item => item?.missingIds || []))).slice(0, 20),
                                    contaminatedIds: Array.from(new Set(diagnosticsCollection.flatMap(item => item?.contaminatedIds || []))).slice(0, 20),
                                    reviewIds: Array.from(new Set(diagnosticsCollection.flatMap(item => item?.reviewIds || []))).slice(0, 50),
                                    finalStatus: diagnosticsCollection.some(item => item?.finalStatus === 'review')
                                        ? 'review'
                                        : diagnosticsCollection.some(item => item?.finalStatus === 'fallback')
                                            ? 'fallback'
                                            : diagnosticsCollection.some(item => item?.finalStatus === 'partial')
                                                ? 'partial'
                                                : 'ok'
                                }
                            db.prepare('UPDATE task_responses SET response_meta = ? WHERE id = ?').run(JSON.stringify({ ...currentMeta, chunkRisk, chunkDiagnostics: combinedDiagnostics }), responseRow.id)
                        }
                    } catch { /* ignore diagnostics patch failure */ }

                    translatedChunk = chunk.map(entry => {
                        const cachedText = cachedResults.get(String(entry.id))
                        if (cachedText) {
                            return { ...entry, translatedText: cachedText }
                        }
                        const nonVerbalText = nonVerbalResults.get(String(entry.id))
                        if (nonVerbalText) {
                            return { ...entry, translatedText: nonVerbalText }
                        }
                        const aiResult = aiResultByOriginalId.get(String(entry.id))
                        return aiResult || entry
                    })
                }

                completedChunksPerChunk.set(index, translatedChunk.length)
                for (const entry of translatedChunk) {
                    translatedMap.set(String(entry.id), entry)
                }

                updateGlobalProgress()

                this.updateStatus(taskId, 'translating', 30 + Math.floor((globalCompletedChunks / totalChunks) * 60), {
                    totalChunks,
                    completedChunks: globalCompletedChunks,
                    log: `[AI] 块 #${index + 1} 翻译完成 (${globalCompletedChunks}/${totalChunks})`
                })
            }))

            await Promise.all(promises)

            assertTaskNotCancelled(taskId)
            await this.updateStatus(taskId, 'exporting', 90, { log: '正在合成并保存最终字幕文件...' })
            let translatedEntries = Array.from(translatedMap.values())
            translatedEntries.sort((a, b) => Number(a.id) - Number(b.id))

            if (task.outputMode !== 'original') {
                const repaired = SubtitleService.repairTranslatedEntries(
                    translatedEntries,
                    task.targetLanguage,
                    task.outputMode as 'translated' | 'bilingual' | 'original'
                )
                translatedEntries = repaired.entries

                if (repaired.repaired > 0) {
                    const repairSummary = Object.entries(repaired.issueCounts)
                        .map(([issueReason, count]) => issueReason + ':' + count)
                        .join(', ')
                    writeTaskLog(taskId, 'exporting', repaired.fallbacked > 0 ? 'warn' : 'info', '[修复] 已自动修正 ' + repaired.repaired + ' 条字幕（' + (repairSummary || 'no-details') + '）')
                }

                const issues = SubtitleService.validateTranslatedEntries(translatedEntries, task.targetLanguage)

                if (issues.length > 0) {
                    const preview = issues.slice(0, 5).map(issue => `#${issue.id}:${issue.reason}`).join(', ')
                    persistReviewEntries(taskId, translatedEntries, issues)
                    writeTaskLog(taskId, 'exporting', 'warn', `[核对] 检测到 ${issues.length} 条字幕需注意：${preview}`)
                } else {
                    persistReviewEntries(taskId, translatedEntries, [])
                }
            }

            assertTaskNotCancelled(taskId)
            const savedPath = await SubtitleService.writeSubtitle(translatedEntries, outputPath, task.outputMode as 'translated' | 'bilingual' | 'original', subtitleFormat, subtitleStylePreset, bilingualLayout, srtPath)
            await this.updateStatus(taskId, 'exporting', 95, { log: `文件保存成功: ${savedPath}` })

            TranslationService.cleanupPartialFiles(taskId, totalChunks)

            await this.updateStatus(taskId, 'done', 100)
            db.prepare('UPDATE tasks SET status = \'done\', progress = 100, output_path = ?, updated_at = datetime(\'now\') WHERE task_id = ?')
                .run(savedPath, taskId)
            console.log(`[Task] 完成任务: ${taskId} 输出: ${savedPath}`)

        } catch (e: any) {
            if (e instanceof TaskCancelledError || isTaskCancelled(taskId)) {
                const current = this.getTask(taskId)
                await this.updateStatus(taskId, 'cancelled', current.progress || 0, {
                    error: '用户取消任务',
                    log: '任务已取消，后台执行已停止。',
                    level: 'warn'
                })
                useDb().prepare("UPDATE tasks SET status = 'cancelled', error = ?, updated_at = datetime('now') WHERE task_id = ?").run('用户取消任务', taskId)
                return
            }

            const message = e?.message || 'Unknown error'
            const classified = classifyTaskError(message)
            const maskedKey = openaiConfig.apiKey ? `${openaiConfig.apiKey.substring(0, 6)}...` : 'MISSING'
            console.error('\n' + '='.repeat(50))
            console.error(`[DEBUG] 任务失败详情 - Task ID: ${taskId}`)
            console.error(`[DEBUG] 接口地址 (Base URL): ${openaiConfig.baseUrl || 'https://api.openai.com/v1'}`)
            console.error(`[DEBUG] API Key (前6位): ${maskedKey}`)
            console.error(`[DEBUG] 使用模型: ${task.model}`)
            console.error(`[DEBUG] 目标语言: ${task.targetLanguage}`)
            console.error(`[DEBUG] 错误信息: ${message}`)
            if (e.response?.data) {
                console.error(`[DEBUG] API 响应详情: ${JSON.stringify(e.response.data)}`)
            }
            console.error('='.repeat(50) + '\n')

            await this.updateStatus(taskId, 'error', 0, {
                error: `${classified.summary} (${message})`,
                log: `!!! 任务失败: ${classified.summary}${e.stack ? '\n堆栈信息: ' + e.stack.split('\n').slice(0, 3).join('\n') : ''}`
            })
            useDb().prepare('UPDATE tasks SET status = \'error\', error = ?, updated_at = datetime(\'now\') WHERE task_id = ?').run(`${classified.summary} (${message})`, taskId)
        } finally {
            cancelledTaskIds.delete(taskId)
            taskAbortControllers.delete(taskId)
            if (task.sourceType === 'embedded' && existsSync(srtPath)) {
                try {
                    rmSync(srtPath, { force: true })
                    console.log(`[Task] Cleaned up temp file: ${srtPath}`)
                } catch (err) {
                    console.error(`[Task] Failed to clean up temp file: ${srtPath}`, err)
                }
            }
        }
    }
}
