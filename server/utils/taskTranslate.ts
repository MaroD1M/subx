import pLimit from 'p-limit'
import { useDb } from './db'
import { SubtitleService } from './subtitle'
import { TranslationService, TRANSLATION_CONTEXT_WINDOW, TRANSLATION_PROMPT_VERSION, type TranslationContext } from './translation'
import { analyzeChunkRisk, expandRetryEntries, type ChunkDiagnostics } from './taskSupport'
import { TaskCancelledError, ensureTaskNotCancelled } from './taskState'
import { writeTaskLog } from './taskLog'
import { createProvider, normalizeProviderType } from './providers/registry'
import type { BoundTranslationProvider } from './providers/types'
import { STYLE_PRESETS } from '~~/shared/stylePresets'
import { resolveSeriesTranslationContext, SeriesService } from './series'
import { TranslationMemoryService } from './translationMemory'
import type { TranslationTask, SubtitleEntry, TaskStatus } from '~~/types'

interface TranslateSubtitlesOptions {
    taskId: string
    task: TranslationTask
    config: any
    runtimeConfig: { apiKey: string, baseUrl?: string }
    allEntries: SubtitleEntry[]
    chunks: SubtitleEntry[][]
    chunkOffsets: number[]
    totalChunks: number
    signal: AbortSignal
    updateStatus: (taskId: string, status: TaskStatus, progress: number, data?: any) => Promise<void>
}

export async function translateSubtitles(options: TranslateSubtitlesOptions): Promise<{
    translatedEntries: SubtitleEntry[]
    stylePrompt: string
    translationContext: TranslationContext
    fallbackCount: number
}> {
    const { taskId, task, config, runtimeConfig, allEntries, chunks, chunkOffsets, totalChunks, signal, updateStatus } = options
    const db = useDb()
    let fallbackCount = 0

    await updateStatus(taskId, 'translating', 30, {
        totalChunks,
        completedChunks: 0,
        stepProgress: 0,
        stepMessage: '正在准备翻译...'
    })

    const provider = createProvider({
        type: normalizeProviderType((config as any).providerType),
        apiKey: runtimeConfig.apiKey,
        baseUrl: runtimeConfig.baseUrl,
        model: task.model
    })
    const fallbackModel = String(config.fallbackModel || '').trim()
    let fallbackProvider: BoundTranslationProvider | null = null
    if (config.fallbackProviderEnabled === true && fallbackModel) {
        try {
            fallbackProvider = createProvider({
                type: normalizeProviderType((config as any).fallbackProviderType),
                apiKey: String(config.fallbackApiKey || '').trim() || 'not-needed',
                baseUrl: String(config.fallbackApiBaseUrl || '').trim() || undefined,
                model: fallbackModel
            })
        } catch (error: any) {
            console.warn('[Fallback] Failed to initialize fallback provider:', error?.message || error)
        }
    }
    // Chunks execute serially so the rolling context always comes from the previous chunk.
    const limit = pLimit(1)
    const maxRetries = config.maxRetries || 3

    let seriesProfile = null
    if (task.seriesKey) {
        try {
            seriesProfile = SeriesService.getProfileByKey(task.seriesKey)
        } catch (error: any) {
            console.warn('[Series] Failed to load series profile:', error?.message || error)
        }
    }
    const resolvedContext = resolveSeriesTranslationContext(task, config.glossary || {}, seriesProfile)
    const glossary = resolvedContext.glossary

    const allStylePresets = [...STYLE_PRESETS, ...(Array.isArray(config.customStylePresets) ? config.customStylePresets : [])]
    const stylePresetConfig = allStylePresets.find(s => s.id === task.stylePreset)
    const stylePrompt = String(task.stylePrompt || stylePresetConfig?.prompt || '')
    const translationContext: TranslationContext = {
        title: resolvedContext.title,
        background: resolvedContext.background,
        instructions: resolvedContext.instructions
    }
    if (seriesProfile) {
        await updateStatus(taskId, 'translating', 30, { log: `已加载系列记忆: ${seriesProfile.title || task.seriesKey}` })
    }
    if (stylePrompt) {
        await updateStatus(taskId, 'translating', 30, { log: `使用翻译风格: ${stylePresetConfig?.name || task.stylePreset}` })
    }
    if (translationContext.title || translationContext.background || translationContext.instructions) {
        await updateStatus(taskId, 'translating', 30, { log: '已附加片名/背景/额外要求到翻译上下文。' })
    }
    if (task.forceRetranslate) {
        await updateStatus(taskId, 'translating', 30, { log: '已启用重新翻译：本次任务将跳过本地缓存。' })
    }

    const memoryResults = config.translationMemoryEnabled !== false && !task.forceRetranslate
        ? TranslationMemoryService.lookup(allEntries, task.targetLanguage, task.seriesKey || '')
        : new Map<string, string>()
    if (memoryResults.size > 0) {
        await updateStatus(taskId, 'translating', 30, { log: `翻译记忆命中 ${memoryResults.size} 条，优先复用已确认译法。` })
    }

    const translatedMap = new Map<string, SubtitleEntry>()
    const completedChunksPerChunk = new Map<number, number>()
    let globalCompletedChunks = 0

    const updateGlobalProgress = () => {
        globalCompletedChunks = 0
        for (const count of completedChunksPerChunk.values()) {
            globalCompletedChunks += count > 0 ? 1 : 0
        }
        const stepProgress = totalChunks > 0 ? Math.floor((globalCompletedChunks / totalChunks) * 100) : 100
        const progress = 30 + Math.floor(stepProgress * 0.6)
        updateStatus(taskId, 'translating', progress, {
            totalChunks,
            completedChunks: globalCompletedChunks,
            stepProgress,
            stepMessage: `已翻译 ${globalCompletedChunks}/${totalChunks} 个文本块`,
            currentText: `翻译进度: ${globalCompletedChunks}/${totalChunks}`
        }).catch(error => console.error('[Task] Failed to update translation progress', error))
    }

    const promises = chunks.map((chunk, index) => limit(async () => {
        await ensureTaskNotCancelled(taskId)
        const chunkStart = chunkOffsets[index] ?? 0
        const chunkEnd = chunkStart + chunk.length
        const previousContext = allEntries
            .slice(Math.max(0, chunkStart - TRANSLATION_CONTEXT_WINDOW), chunkStart)
            .map(entry => translatedMap.get(String(entry.id)) || entry)
        const nextContext = allEntries.slice(chunkEnd, chunkEnd + TRANSLATION_CONTEXT_WINDOW)

        const uncachedEntries: SubtitleEntry[] = []
        const cachedResults = new Map<string, string>()
        const nonVerbalResults = new Map<string, string>()

        const shouldUseCache = !task.forceRetranslate
        const chunkRisk = analyzeChunkRisk(chunk)
        const effectiveStylePrompt = [stylePrompt, chunkRisk.stylePromptSuffix].filter(Boolean).join('\n\n')
        const contextWindowKey = [...previousContext, ...nextContext].map(entry => String(entry.text || '')).join('\u0001')
        const contextCacheKey = JSON.stringify({ title: translationContext.title, background: translationContext.background, instructions: translationContext.instructions, contextWindowKey })
        for (const entry of chunk) {
            if (SubtitleService.isNonVerbal(entry.text)) {
                nonVerbalResults.set(String(entry.id), entry.text)
                continue
            }

            const memoryText = memoryResults.get(String(entry.id))
            if (memoryText) {
                cachedResults.set(String(entry.id), memoryText)
                continue
            }

            const sourceText = entry.text
            if (!shouldUseCache) {
                uncachedEntries.push(entry)
                continue
            }
            const cacheHash = SubtitleService.computeCacheHash(sourceText, task.model, task.targetLanguage, { glossary, stylePrompt: effectiveStylePrompt, promptVersion: TRANSLATION_PROMPT_VERSION, outputMode: task.outputMode, context: contextCacheKey })
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
            const idMapping = new Map<string, string>()
            const remappedChunk: SubtitleEntry[] = uncachedEntries.map((entry, i) => {
                const sequentialId = String(i + 1)
                idMapping.set(sequentialId, String(entry.id))
                return { ...entry, id: sequentialId }
            })

            const chunkResult = await translateChunkWithRetry(
                provider, remappedChunk, task.targetLanguage, glossary,
                previousContext, task.model, taskId, index,
                effectiveStylePrompt, maxRetries,
                undefined,
                (config.translationMode === 'stream') && (config.streamUsage || false),
                config.translationMode === 'stream',
                '块 #' + (index + 1),
                signal,
                translationContext,
                nextContext
            )

            const fallbackRecoveredIds = new Set<string>()
            if (fallbackProvider && chunkResult.diagnostics.fallbackCount > 0) {
                const resultById = new Map(chunkResult.entries.map(entry => [String(entry.id), entry]))
                const fallbackEntries = remappedChunk.filter((entry) => {
                    const translated = String(resultById.get(String(entry.id))?.translatedText || '')
                    return !translated || translated === String(entry.text || '')
                })
                if (fallbackEntries.length > 0) {
                    try {
                        const fallbackResult = await translateChunkWithRetry(
                            fallbackProvider,
                            fallbackEntries,
                            task.targetLanguage,
                            glossary,
                            previousContext,
                            fallbackModel,
                            taskId,
                            index,
                            effectiveStylePrompt,
                            Math.min(2, Math.max(1, maxRetries)),
                            undefined,
                            false,
                            false,
                            '块 #' + (index + 1) + ' 备用供应商',
                            signal,
                            translationContext,
                            nextContext
                        )
                        const fallbackById = new Map(fallbackResult.entries.map(entry => [String(entry.id), entry]))
                        const recoveredIds = new Set<string>()
                        chunkResult.entries = chunkResult.entries.map((entry) => {
                            const candidate = fallbackById.get(String(entry.id))
                            const candidateText = String(candidate?.translatedText || '')
                            if (candidateText && candidateText !== String(entry.text || '')) {
                                recoveredIds.add(String(entry.id))
                                fallbackRecoveredIds.add(String(entry.id))
                                return { ...entry, translatedText: candidateText }
                            }
                            return entry
                        })
                        if (recoveredIds.size > 0) {
                            chunkResult.diagnostics.fallbackCount = Math.max(0, chunkResult.diagnostics.fallbackCount - recoveredIds.size)
                            chunkResult.diagnostics.missingIds = chunkResult.diagnostics.missingIds.filter(id => !recoveredIds.has(String(id)))
                            chunkResult.diagnostics.finalStatus = chunkResult.diagnostics.fallbackCount > 0 ? 'partial' : 'ok'
                            writeTaskLog(
                                taskId,
                                'translating',
                                'info',
                                `[回退] 块 #${index + 1} 使用备用供应商补译 ${fallbackEntries.length} 条，成功 ${recoveredIds.size} 条`
                            )
                        }
                    } catch (error: any) {
                        if (error instanceof TaskCancelledError) throw error
                        writeTaskLog(
                            taskId,
                            'translating',
                            'warn',
                            `[回退] 块 #${index + 1} 备用供应商失败：${error?.message || error}`
                        )
                    }
                }
            }
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

                const normalizedTranslated = SubtitleService.normalizeComparisonText(entry.translatedText)
                const normalizedOriginal = SubtitleService.normalizeComparisonText(originalEntry.text)
                if (allowCache && entry.translatedText && normalizedTranslated !== normalizedOriginal
                    && !SubtitleService.isNonVerbal(originalEntry.text)
                    && !fallbackRecoveredIds.has(String(entry.id))
                ) {
                    const cacheHash = SubtitleService.computeCacheHash(originalEntry.text, task.model, task.targetLanguage, { glossary, stylePrompt: effectiveStylePrompt, promptVersion: TRANSLATION_PROMPT_VERSION, outputMode: task.outputMode, context: contextCacheKey })
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

        updateStatus(taskId, 'translating', 30 + Math.floor((globalCompletedChunks / totalChunks) * 60), {
            totalChunks,
            completedChunks: globalCompletedChunks,
            log: `[AI] 块 #${index + 1} 翻译完成 (${globalCompletedChunks}/${totalChunks})`
        }).catch(error => console.error('[Task] Failed to update chunk progress', error))
    }))

    await Promise.all(promises)

    return {
        translatedEntries: Array.from(translatedMap.values()),
        stylePrompt,
        translationContext,
        fallbackCount
    }
}


export async function translateChunkWithRetry(
    provider: BoundTranslationProvider,
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
    signal?: AbortSignal,
    translationContext?: TranslationContext,
    nextContext: SubtitleEntry[] = []
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
        if (signal?.aborted) throw new TaskCancelledError()
        await ensureTaskNotCancelled(taskId)
        if (unresolvedEntries.length === 0) break

        if (attempt > 0) {
            diagnostics.retryAttempts = Math.max(diagnostics.retryAttempts, attempt)
            console.log(`[Retry] Task ${taskId} chunk ${chunkIndex}: 正在进行第 ${attempt}/${maxRetries} 次增量重试，剩余 ${unresolvedEntries.length} 条待处理`)
            writeTaskLog(taskId, 'translating', 'warn', '[重试] ' + chunkLabel + ' 第 ' + attempt + '/' + maxRetries + ' 次重试，仅补译剩余 ' + unresolvedEntries.length + ' 条')
            await new Promise(resolve => setTimeout(resolve, 1000 * attempt))
        }

        try {
            const results = await TranslationService.translateChunk(
                provider, unresolvedEntries, targetLanguage, glossary, previousContext, model, taskId, chunkIndex, stylePrompt, callbacks, streamUsage, attempt, useStreaming, signal, translationContext, nextContext
            )
            await ensureTaskNotCancelled(taskId)

            const expectedCount = unresolvedEntries.length
            const returnedIds = new Set<string>()
            const acceptedIds = new Set<string>()
            for (const entry of results) {
                const id = String(entry.id)
                const translatedText = String(entry.translatedText || '')
                const accepted = translatedText.length > 0
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

            const retryIds = new Set([...unresolvedIds, ...expandRetryEntries(unresolvedEntries, missingIds).map(entry => String(entry.id))])
            unresolvedEntries = unresolvedEntries.filter(entry => retryIds.has(String(entry.id)) && !finalResults.has(String(entry.id)))

            if (unresolvedEntries.length === 0) {
                break   // safety guard: should not be reachable since unresolvedIds.length===0 check above breaks first
            }

            const acceptedCount = expectedCount - unresolvedEntries.length
            const sameTextCount = results.filter(entry => String(entry.translatedText || '') === String(entry.text || '')).length
            const contaminatedIds = results
                .filter(entry => SubtitleService.isLikelyContaminatedTranslation(String(entry.text || ''), String(entry.translatedText || '')))
                .map(entry => String(entry.id))
            diagnostics.validationFailures++
            diagnostics.missingIds = Array.from(new Set([...diagnostics.missingIds, ...missingIds])).slice(0, 20)
            diagnostics.contaminatedIds = Array.from(new Set([...diagnostics.contaminatedIds, ...contaminatedIds])).slice(0, 20)
            const missingSuffix = missingIds.length > 0 ? `，缺失 ID: ${missingIds.join(', ')}` : ''
            const sameTextSuffix = sameTextCount > 0 ? `，未改动原文: ${sameTextCount} 条(将进入核对)` : ''
            const contaminationSuffix = contaminatedIds.length > 0 ? `，疑似串条 ID: ${contaminatedIds.join(', ')}` : ''
            writeTaskLog(
                taskId,
                'translating',
                sameTextCount > 0 ? 'warn' : 'info',
                '[校验] ' + chunkLabel + ' AI 返回 ' + results.length + '/' + expectedCount + '，有效 ' + acceptedCount + '/' + expectedCount + '，待处理 ' + unresolvedEntries.length + ' 条' + sameTextSuffix + missingSuffix + contaminationSuffix
            )

            if (acceptedCount === 0) {
                const sampleIds = results.slice(0, 3).map(entry => `#${entry.id} "${String(entry.text || '').substring(0, 30)}" → "${String(entry.translatedText || '').substring(0, 30)}"`)
                writeTaskLog(taskId, 'translating', 'warn', `[解析内容] ${chunkLabel} 已匹配全部 ID 但翻译均未通过校验(有效 ${acceptedCount}/${expectedCount})，示例: ${sampleIds.join(' | ')}`)

                const diagLines: string[] = []
                results.forEach(entry => {
                    const orig = String(entry.text || '')
                    const trans = String(entry.translatedText || '')
                    const empty = !trans
                    const same = !empty && trans === orig
                    if (empty || same) {
                        diagLines.push(`#${entry.id} ${empty ? 'EMPTY' : 'SAME'} orig="${orig}" trans="${trans}"`)
                    }
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
            if (e instanceof TaskCancelledError) throw e
            if (signal?.aborted) throw new TaskCancelledError()
            console.error(`[Retry] Task ${taskId} chunk ${chunkIndex} 尝试失败:`, e.message)
            const detail = String(e?.message || 'unknown')
            const reason = detail.includes('[条目缺失]') ? '返回缺条' : detail.includes('[解析为空]') ? '空响应/格式异常' : detail.includes('[疑似拒答]') ? '疑似拒答/过滤' : detail.includes('[无有效译文]') ? '无有效译文' : '请求失败'

            if (Array.isArray(e?.partialResults) && e.partialResults.length > 0) {
                for (const entry of e.partialResults) {
                    const id = String(entry.id)
                    if (entry?.translatedText) {
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
        diagnostics.fallbackCount += unresolvedEntries.length
        diagnostics.finalStatus = 'fallback'
        for (const entry of unresolvedEntries) {
            finalResults.set(String(entry.id), { ...entry, translatedText: entry.text })
        }
    }

    const stillMissing = chunk.filter(entry => !finalResults.has(String(entry.id)))
    if (stillMissing.length > 0) {
        const ids = stillMissing.map(entry => `#${entry.id}`).join(', ')
        diagnostics.missingIds = Array.from(new Set([...diagnostics.missingIds, ...stillMissing.map(entry => String(entry.id))])).slice(0, 20)
        diagnostics.fallbackCount += stillMissing.length
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
