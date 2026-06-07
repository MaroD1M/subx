import OpenAI from 'openai'
import pLimit from 'p-limit'
import { join, dirname, basename } from 'path'
import { existsSync, mkdirSync, rmSync } from 'fs'
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

type TaskLogCategory = 'system' | 'translation' | 'export' | 'error' | 'process'

function resolveLogCategory(step: string | null, level: 'info' | 'error' | 'warn', message: string): TaskLogCategory {
    if (level === 'error' || step === 'error' || /失败|错误|异常|取消|error/i.test(message)) return 'error'
    if (step === 'exporting' || /导出|保存|输出文件/i.test(message)) return 'export'
    if (step === 'translating' || /翻译|文本块|chunk|tokens|模型|术语表|风格/i.test(message)) return 'translation'
    if (step === 'queued' || step === 'extracting' || step === 'parsing' || /提取|解析|SRT|字幕|初始化|队列|创建/i.test(message)) return 'system'
    return 'process'
}

function writeTaskLog(taskId: string, step: string | null, level: 'info' | 'error' | 'warn', message: string, category?: TaskLogCategory) {
    const db = useDb()
    const resolvedCategory = category || resolveLogCategory(step, level, message)
    db.prepare("INSERT INTO task_logs (task_id, step, category, level, message, created_at) VALUES (?, ?, ?, ?, ?, datetime('now'))")
        .run(taskId, step, resolvedCategory, level, message)
}

class TaskQueue {
    private queue: { taskId: string, openaiConfig: any, resolve: (value: void) => void, reject: (reason: any) => void }[] = [];
    private active = 0;

    async add(taskId: string, openaiConfig: any): Promise<void> {
        return new Promise((resolve, reject) => {
            this.queue.push({ taskId, openaiConfig, resolve, reject });
            this.next();
        });
    }

    private async next() {
        const config = await ConfigService.getConfig();
        const concurrency = Math.max(1, Number(config.concurrency) || 3);

        while (this.active < concurrency && this.queue.length > 0) {
            const taskArgs = this.queue.shift();
            if (taskArgs) {
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

function isAcceptableTranslatedEntry(entry: SubtitleEntry, targetLanguage: string) {
    if (!entry?.translatedText) return false
    const original = String(entry.text || '')
    const translated = String(entry.translatedText || '')
    const normalizedOriginal = SubtitleService.normalizeComparisonText(original)
    const normalizedTranslated = SubtitleService.normalizeComparisonText(translated)
    if (!normalizedTranslated) return false
    if (normalizedOriginal !== normalizedTranslated) return true
    return SubtitleService.isAcceptableSameText(original, translated, targetLanguage)
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
    useStreaming: boolean = false
): Promise<SubtitleEntry[]> {
    const finalResults = new Map<string, SubtitleEntry>()
    let unresolvedEntries = [...chunk]

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        if (unresolvedEntries.length === 0) break

        if (attempt > 0) {
            console.log(`[Retry] Task ${taskId} chunk ${chunkIndex}: 正在进行第 ${attempt}/${maxRetries} 次增量重试，剩余 ${unresolvedEntries.length} 条待处理`)
            writeTaskLog(taskId, 'translating', 'warn', `[重试] 块 #${chunkIndex + 1} 第 ${attempt}/${maxRetries} 次重试，仅补译剩余 ${unresolvedEntries.length} 条`)
            await new Promise(resolve => setTimeout(resolve, 1000 * attempt))
        }

        try {
            const results = await TranslationService.translateChunk(
                openai, unresolvedEntries, targetLanguage, glossary, previousContext, model, taskId, chunkIndex, stylePrompt, callbacks, streamUsage, attempt, useStreaming
            )

            const expectedCount = unresolvedEntries.length
            const returnedIds = new Set<string>()
            for (const entry of results) {
                const id = String(entry.id)
                returnedIds.add(id)
                if (isAcceptableTranslatedEntry(entry, targetLanguage)) {
                    finalResults.set(id, entry)
                }
            }

            const missingIds = unresolvedEntries
                .map(entry => String(entry.id))
                .filter(id => !returnedIds.has(id))
            const unresolvedIds = unresolvedEntries
                .map(entry => String(entry.id))
                .filter(id => !finalResults.has(id))
            unresolvedEntries = unresolvedEntries.filter(entry => unresolvedIds.includes(String(entry.id)))

            if (unresolvedEntries.length === 0) {
                break
            }

            const missingSuffix = missingIds.length > 0 ? `，缺失 ID: ${missingIds.join(', ')}` : ''
            writeTaskLog(
                taskId,
                'translating',
                'warn',
                `[校验] 块 #${chunkIndex + 1} AI 返回 ${results.length}/${expectedCount}，有效 ${expectedCount - unresolvedEntries.length}/${expectedCount}，待补译 ${unresolvedEntries.length} 条${missingSuffix}`
            )
        } catch (e: any) {
            console.error(`[Retry] Task ${taskId} chunk ${chunkIndex} 尝试失败:`, e.message)
            const detail = String(e?.message || 'unknown')
            const reason = detail.includes('[条目缺失]') ? '返回缺条' : detail.includes('[解析为空]') ? '空响应/格式异常' : detail.includes('[疑似拒答]') ? '疑似拒答/过滤' : detail.includes('[无有效译文]') ? '无有效译文' : '请求失败'

            if (Array.isArray(e?.partialResults) && e.partialResults.length > 0) {
                for (const entry of e.partialResults) {
                    const id = String(entry.id)
                    if (isAcceptableTranslatedEntry(entry, targetLanguage)) {
                        finalResults.set(id, entry)
                    }
                }

                const missingIdSet = new Set((Array.isArray(e?.missingIds) ? e.missingIds : []).map((id: any) => String(id)))
                unresolvedEntries = unresolvedEntries.filter(entry => missingIdSet.has(String(entry.id)))

                writeTaskLog(
                    taskId,
                    'translating',
                    'warn',
                    `[重试失败] 块 #${chunkIndex + 1} 第 ${attempt + 1} 次尝试失败（${reason}）：${detail}；已保留 ${e.partialResults.length} 条有效结果，待补 ${unresolvedEntries.length} 条`
                )
                continue
            }

            writeTaskLog(taskId, 'translating', 'warn', `[重试失败] 块 #${chunkIndex + 1} 第 ${attempt + 1} 次尝试失败（${reason}）：${detail}`)
        }
    }

    if (unresolvedEntries.length > 0) {
        const ids = unresolvedEntries.map(entry => `#${entry.id}`).join(', ')
        console.warn(`[Task] Task ${taskId} chunk ${chunkIndex}: 常规重试后仍有 ${unresolvedEntries.length} 条待处理，开始逐条补译。`)
        writeTaskLog(taskId, 'translating', 'warn', `[补译] 块 #${chunkIndex + 1} 逐条补译 ${unresolvedEntries.length} 条：${ids}`)

        for (const entry of unresolvedEntries) {
            try {
                const singleResults = await TranslationService.translateChunk(
                    openai,
                    [{ ...entry }],
                    targetLanguage,
                    glossary,
                    previousContext,
                    model,
                    taskId,
                    chunkIndex,
                    stylePrompt,
                    callbacks,
                    false,
                    maxRetries + 1,
                    false
                )
                const singleTranslated = singleResults[0]
                if (singleTranslated?.translatedText && isAcceptableTranslatedEntry({ ...entry, translatedText: singleTranslated.translatedText }, targetLanguage)) {
                    finalResults.set(String(entry.id), { ...entry, translatedText: singleTranslated.translatedText })
                    writeTaskLog(taskId, 'translating', 'info', `[补译成功] 块 #${chunkIndex + 1} 条目 #${entry.id} 已单条补译成功`)
                } else {
                    writeTaskLog(taskId, 'translating', 'warn', `[补译未命中] 块 #${chunkIndex + 1} 条目 #${entry.id} 返回为空、拒答，或结果仍需人工复核`)
                }
            } catch (singleError: any) {
                writeTaskLog(taskId, 'translating', 'warn', `[补译失败] 块 #${chunkIndex + 1} 条目 #${entry.id} 单条补译失败：${singleError?.message || 'unknown'}`)
            }
        }
    }

    const stillMissing = chunk.filter(entry => !finalResults.has(String(entry.id)))
    if (stillMissing.length > 0) {
        const ids = stillMissing.map(entry => `#${entry.id}`).join(', ')
        console.warn(`[Task] Task ${taskId} chunk ${chunkIndex}: 补译后仍有 ${stillMissing.length} 条缺失，将回退为原文。`)
        writeTaskLog(taskId, 'translating', 'warn', `[降级] 块 #${chunkIndex + 1} ${stillMissing.length} 条未成功翻译，已回退原文：${ids}`)
    }

    return chunk.map(entry => {
        const translated = finalResults.get(String(entry.id))
        return translated || { ...entry, translatedText: entry.text }
    })
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

function shouldBlockExport(issues: Array<{ severity?: 'soft' | 'hard', reason?: string }>, totalEntries: number, toleranceMode: 'strict' | 'balanced' | 'lenient' = 'balanced') {
    const hardIssues = issues.filter(issue => issue.severity !== 'soft')
    const softIssues = issues.filter(issue => issue.severity === 'soft')
    const issueRatio = issues.length / Math.max(totalEntries, 1)
    const hardRatio = hardIssues.length / Math.max(totalEntries, 1)
    const criticalIssues = issues.filter(issue => issue.reason === 'missing')

    if (toleranceMode === 'strict') {
        return { block: issues.length > 0, hardIssues, softIssues, criticalIssues }
    }

    if (toleranceMode === 'lenient') {
        const block = criticalIssues.length >= 3 || hardIssues.length >= 8 || hardRatio > 0.08 || issueRatio > 0.15
        return { block, hardIssues, softIssues, criticalIssues }
    }

    const block = criticalIssues.length >= 2 || hardIssues.length >= 5 || hardRatio > 0.04 || issueRatio > 0.10
    return { block, hardIssues, softIssues, criticalIssues }
}

export const TaskService = {
    async createTask(task: Partial<TranslationTask>): Promise<TranslationTask> {
        const db = useDb()
        const stmt = db.prepare(`
      INSERT INTO tasks (
        task_id, file_path, root_id, source_type, track_index, model, target_lang, output_mode, style_preset, translation_mode, subtitle_format, subtitle_style_preset, bilingual_layout, status, progress, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `)
        stmt.run(
            task.taskId, task.filePath, task.rootId || null, task.sourceType, task.trackIndex,
            task.model, task.targetLanguage, task.outputMode, task.stylePreset || 'default', task.translationMode || 'non_stream', task.subtitleFormat || 'srt', task.subtitleStylePreset || 'bilingual_simple', task.bilingualLayout || 'translated_first', 'queued', 0
        )
        writeTaskLog(task.taskId!, 'queued', 'info', '任务已创建，等待执行')
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
            totalChunks: task.total_chunks,
            completedChunks: task.done_chunks,
            createdAt: task.created_at,
            updatedAt: task.updated_at
        }
    },

    async updateStatus(taskId: string, status: TaskStatus, progress: number, data: any = {}) {
        const db = useDb()
        const stmt = db.prepare('UPDATE tasks SET status = ?, progress = ?, updated_at = datetime(\'now\') WHERE task_id = ?')
        stmt.run(status, progress, taskId)

        if (data.log) {
            const level = status === 'error' ? 'error' : (data.level || 'info')
            const category = data.category || resolveLogCategory(status, level, data.log)
            writeTaskLog(taskId, status, level, data.log, category)
            taskEvents.emit('progress', { taskId, step: status, progress, ...data, level, category })
            if (status === 'done' || status === 'error') {
                taskEvents.emit(status, { taskId, step: status, progress, ...data, level, category, final: true })
            }
            return
        }

        taskEvents.emit('progress', { taskId, step: status, progress, ...data })
        if (status === 'done' || status === 'error') {
            taskEvents.emit(status, { taskId, step: status, progress, ...data, final: true })
        }
    },

    async process(taskId: string, openaiConfig: { apiKey: string, baseUrl?: string }) {
        await ConfigService.cleanupLogsIfNeeded()
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
        const outputExt = 'srt'
        const outputSuffix = task.outputMode === 'original' ? 'original' : task.targetLanguage
        const inputPath = await resolveMediaPath(task.filePath, task.rootId)
        const outputBaseName = basename(cleanName)
        const outputPath = join(dirname(inputPath), `${outputBaseName}.${outputSuffix}.${outputExt}`)

        try {
            await this.updateStatus(taskId, 'extracting', 10, { log: '正在从原视频中提取字幕流...' })
            if (task.sourceType === 'embedded') {
                await VideoService.extractSubtitle(task.filePath, task.trackIndex!, srtPath, task.rootId)
                await this.updateStatus(taskId, 'extracting', 15, { log: '字幕提取成功，保存至临时文件。' })
            } else {
                await this.updateStatus(taskId, 'extracting', 15, { log: '使用外部字幕文件。' })
            }

            await this.updateStatus(taskId, 'parsing', 20, { log: '正在解析 SRT 并进行智能分块...' })
            const allEntries = await SubtitleService.parseSubtitle(srtPath)

            const config = await ConfigService.getConfig()
            const chunkSize = config.chunkSize || 2000
            const subtitleFormat = task.subtitleFormat || config.subtitleFormat || 'srt'
            const subtitleStylePreset = task.subtitleStylePreset || config.subtitleStylePreset || 'bilingual_simple'
            const bilingualLayout = task.bilingualLayout || config.bilingualLayout || 'translated_first'
            console.log(`[Task] Using chunk size: ${chunkSize}`)

            const chunks = SubtitleService.chunkByTokens(allEntries, chunkSize)
            const totalChunks = chunks.length
            await this.updateStatus(taskId, 'parsing', 25, { log: `解析完成，共划分为 ${totalChunks} 个文本块。` })

            const db = useDb()
            db.prepare('UPDATE tasks SET total_chunks = ? WHERE task_id = ?').run(totalChunks, taskId)

            if (task.outputMode === 'original') {
                await this.updateStatus(taskId, 'translating', 80, { totalChunks, completedChunks: totalChunks, log: '已选择仅导出原字幕，跳过翻译。' })
                await this.updateStatus(taskId, 'exporting', 90, { log: '正在导出原字幕文件...' })
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
            const chunkLimit = Math.max(1, config.concurrency || 3)
            const limit = pLimit(chunkLimit)
            const maxRetries = config.maxRetries || 3

            const glossary = config.glossary || {}

            const stylePresetConfig = STYLE_PRESETS.find(s => s.id === task.stylePreset)
            const stylePrompt = stylePresetConfig?.prompt || ''
            if (stylePrompt) {
                await this.updateStatus(taskId, 'translating', 30, { log: `使用翻译风格预设: ${stylePresetConfig!.name}` })
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
                const previousContext = index > 0 && chunks[index - 1]
                    ? chunks[index - 1]!.slice(-5).map(e => {
                        const translated = translatedMap.get(String(e.id))
                        return translated || e
                    })
                    : []

                const uncachedEntries: SubtitleEntry[] = []
                const cachedResults = new Map<string, string>()
                const nonVerbalResults = new Map<string, string>()

                for (const entry of chunk) {
                    if (SubtitleService.isNonVerbal(entry.text)) {
                        nonVerbalResults.set(String(entry.id), entry.text)
                        continue
                    }

                    const sourceText = entry.text
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
                    const idMapping = new Map<string, string>()
                    const remappedChunk: SubtitleEntry[] = uncachedEntries.map((entry, i) => {
                        const sequentialId = String(i + 1)
                        idMapping.set(sequentialId, String(entry.id))
                        return { ...entry, id: sequentialId }
                    })

                    const aiResults = await translateChunkWithRetry(
                        openai, remappedChunk, task.targetLanguage, glossary, previousContext,
                        task.model, taskId, index, stylePrompt, maxRetries,
                        {
                            onEntryTranslated: (entry) => {
                                const originalId = idMapping.get(String(entry.id))
                                if (originalId) {
                                    const originalEntry = uncachedEntries.find(e => String(e.id) === originalId)
                                    if (originalEntry) {
                                        translatedMap.set(originalId, {
                                            ...originalEntry,
                                            translatedText: entry.translatedText
                                        })
                                    }
                                }
                            }
                        },
                        (config.translationMode === 'stream') && (config.streamUsage || false),
                        config.translationMode === 'stream'
                    )

                    const aiResultByOriginalId = new Map<string, SubtitleEntry>()
                    for (const entry of aiResults) {
                        const originalId = idMapping.get(String(entry.id))
                        if (originalId) {
                            const originalEntry = uncachedEntries.find(e => String(e.id) === originalId)
                            const restoredEntry: SubtitleEntry = {
                                ...originalEntry!,
                                id: originalId,
                                translatedText: entry.translatedText
                            }
                            aiResultByOriginalId.set(originalId, restoredEntry)

                            if (entry.translatedText && isAcceptableTranslatedEntry({ ...originalEntry!, translatedText: entry.translatedText }, task.targetLanguage) && !SubtitleService.isNonVerbal(originalEntry!.text)) {
                                const cacheHash = SubtitleService.computeCacheHash(originalEntry!.text, task.model, task.targetLanguage)
                                SubtitleService.setCachedTranslation(cacheHash, originalEntry!.text, entry.translatedText, task.model, task.targetLanguage)
                            }
                        }
                    }

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
                    const decision = shouldBlockExport(issues, translatedEntries.length, 'balanced')
                    const preview = issues.slice(0, 5).map(issue => `#${issue.id}:${issue.reason}`).join(', ')

                    if (!decision.block) {
                        writeTaskLog(taskId, 'exporting', 'warn', `[继续导出] 检测到 ${issues.length} 条需注意字幕（硬性 ${decision.hardIssues.length} / 软性 ${decision.softIssues.length}），已继续导出：${preview}`)
                    } else {
                        persistReviewEntries(taskId, translatedEntries, issues)
                        db.prepare("UPDATE tasks SET status = 'review', progress = 96, error = ?, updated_at = datetime('now') WHERE task_id = ?")
                            .run(`待字幕核对：${issues.length} 条需要人工确认`, taskId)
                        await this.updateStatus(taskId, 'review' as any, 96, {
                            totalChunks,
                            completedChunks: totalChunks,
                            log: `[核对] 检测到 ${issues.length} 条字幕需要人工核对（硬性 ${decision.hardIssues.length} / 软性 ${decision.softIssues.length}）：${preview}`,
                            category: 'translation'
                        })
                        return
                    }
                } else {
                    persistReviewEntries(taskId, translatedEntries, [])
                }
            }

            const savedPath = await SubtitleService.writeSubtitle(translatedEntries, outputPath, task.outputMode as 'translated' | 'bilingual' | 'original', subtitleFormat, subtitleStylePreset, bilingualLayout, srtPath)
            await this.updateStatus(taskId, 'exporting', 95, { log: `文件保存成功: ${savedPath}` })

            TranslationService.cleanupPartialFiles(taskId, totalChunks)

            await this.updateStatus(taskId, 'done', 100)
            db.prepare('UPDATE tasks SET status = \'done\', progress = 100, output_path = ?, updated_at = datetime(\'now\') WHERE task_id = ?')
                .run(savedPath, taskId)

        } catch (e: any) {
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
