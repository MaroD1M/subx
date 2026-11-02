/**
 * Task queue and end-to-end processing pipeline.
 *
 * Responsibilities: persistent queue claim/recovery, subtitle/ASR/OCR source
 * resolution, translation, quality checks, review persistence, export and task
 * lifecycle events. Keep long-running work out of request handlers.
 */

import pLimit from 'p-limit'
import { join, dirname, basename, relative } from 'path'
import { existsSync, mkdirSync, rmSync, appendFileSync, readdirSync } from 'fs'
import { EventEmitter } from 'events'
import { useDb } from './db'
import { VideoService } from './video'
import { SubtitleService } from './subtitle'
import { getMediaRoot, resolveMediaPath } from './mediaRoots'
import { TranslationService, TRANSLATION_PROMPT_VERSION, type TranslationContext } from './translation'
import { AsrService } from './asr/client'
import { extractAudioCached, removeCachedAudio } from './asr/audioCache'
import { OcrService } from './ocr/client'
import { QualityService } from './quality'
import { ConfigService } from './config'
import { classifyTaskError } from './taskError'
import { createProvider, normalizeProviderType } from './providers/registry'
import type { BoundTranslationProvider } from './providers/types'
import { STYLE_PRESETS } from '~~/shared/stylePresets'
import type { TranslationTask, SubtitleEntry, TaskStatus } from '~~/types'

export const taskEvents = new EventEmitter()
taskEvents.setMaxListeners(0)
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
    if (step === 'queued' || step === 'probing' || step === 'extracting' || step === 'extracting_audio' || step === 'transcribing' || step === 'parsing' || /提取|解析|SRT|字幕|初始化|队列|创建|语音识别/i.test(message)) return 'system'
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

function isTerminalStatus(status?: string | null) {
    return ['done', 'error', 'review', 'cancelled'].includes(String(status || ''))
}

class TaskQueue {
    private active = 0
    private pumping = false
    private workerId = process.env.SUBX_WORKER_ID || `${process.pid}`
    private runtimeConfigs = new Map<string, { apiKey: string, baseUrl?: string }>()
    private heartbeats = new Map<string, ReturnType<typeof setInterval>>()

    async add(taskId: string, openaiConfig?: { apiKey: string, baseUrl?: string }): Promise<void> {
        const db = useDb()
        cancelledTaskIds.delete(taskId)
        if (openaiConfig) this.runtimeConfigs.set(taskId, openaiConfig)
        db.prepare(`
            INSERT INTO task_jobs (task_id, status, attempts, max_attempts, next_run_at, locked_by, locked_at, heartbeat_at, last_error, created_at, updated_at)
            VALUES (?, 'queued', 0, 3, datetime('now'), NULL, NULL, NULL, NULL, datetime('now'), datetime('now'))
            ON CONFLICT(task_id) DO UPDATE SET
                status='queued',
                next_run_at=datetime('now'),
                locked_by=NULL,
                locked_at=NULL,
                heartbeat_at=NULL,
                last_error=NULL,
                updated_at=datetime('now')
        `).run(taskId)
        void this.kick()
    }

    isActive(taskId: string) {
        if (taskAbortControllers.has(taskId)) return true
        try {
            const row = useDb().prepare("SELECT status FROM task_jobs WHERE task_id = ?").get(taskId) as { status?: string } | undefined
            return row?.status === 'running'
        } catch {
            return false
        }
    }

    isQueued(taskId: string) {
        try {
            const row = useDb().prepare("SELECT status FROM task_jobs WHERE task_id = ?").get(taskId) as { status?: string } | undefined
            return row?.status === 'queued'
        } catch {
            return false
        }
    }

    cancel(taskId: string) {
        cancelledTaskIds.add(taskId)
        taskAbortControllers.get(taskId)?.abort()
        this.runtimeConfigs.delete(taskId)

        let removed = false
        try {
            const info = useDb().prepare(`
                UPDATE task_jobs
                SET status='cancelled', updated_at=datetime('now')
                WHERE task_id = ? AND status IN ('queued', 'running')
            `).run(taskId)
            removed = info.changes > 0
        } catch { /* ignore job table failures */ }
        return removed
    }

    async recoverInterrupted() {
        const db = useDb()
        const staleSeconds = Math.max(60, Number(process.env.SUBX_WORKER_STALE_SECONDS || 120))
        const recovered = db.prepare(`
            UPDATE task_jobs
            SET status='queued', locked_by=NULL, locked_at=NULL, heartbeat_at=NULL,
                next_run_at=datetime('now'), updated_at=datetime('now')
            WHERE status='running'
              AND (heartbeat_at IS NULL OR heartbeat_at < datetime('now', ?))
        `).run(`-${staleSeconds} seconds`)

        const activeStatuses = ['queued', 'probing', 'extracting', 'extracting_audio', 'transcribing', 'ocr', 'parsing', 'translating', 'exporting']
        const created = db.prepare(`
            INSERT INTO task_jobs (task_id, status, attempts, max_attempts, next_run_at, locked_by, locked_at, heartbeat_at, last_error, created_at, updated_at)
            SELECT task_id, 'queued', 0, 3, datetime('now'), NULL, NULL, NULL, NULL, datetime('now'), datetime('now')
            FROM tasks
            WHERE status IN (${activeStatuses.map(() => '?').join(',')})
              AND task_id NOT IN (SELECT task_id FROM task_jobs)
        `).run(...activeStatuses)

        if (recovered.changes > 0 || created.changes > 0) {
            console.warn(`[Queue] Recovered ${recovered.changes} stale job(s), restored ${created.changes} legacy task(s)`)
        }
        void this.kick()
    }

    private claimJob(): string | null {
        const db = useDb()
        const candidate = db.prepare(`
            SELECT task_id FROM task_jobs
            WHERE status='queued' AND next_run_at <= datetime('now') AND attempts < max_attempts
            ORDER BY created_at ASC
            LIMIT 1
        `).get() as { task_id?: string } | undefined
        if (!candidate?.task_id) return null

        const info = db.prepare(`
            UPDATE task_jobs
            SET status='running', attempts=attempts + 1, locked_by=?, locked_at=datetime('now'),
                heartbeat_at=datetime('now'), updated_at=datetime('now')
            WHERE task_id = ? AND status='queued'
        `).run(this.workerId, candidate.task_id)
        return info.changes > 0 ? candidate.task_id : null
    }

    private async kick() {
        if (this.pumping) return
        this.pumping = true
        try {
            while (true) {
                const config = await ConfigService.getConfig()
                const concurrency = Math.max(1, Number(config.concurrency) || 3)
                if (this.active >= concurrency) break

                const taskId = this.claimJob()
                if (!taskId) break
                if (isTaskCancelled(taskId)) {
                    useDb().prepare("UPDATE task_jobs SET status='cancelled', updated_at=datetime('now') WHERE task_id = ?").run(taskId)
                    continue
                }

                const currentTask = TaskService.getTask(taskId)
                if (isTerminalStatus(currentTask?.status)) {
                    useDb().prepare("UPDATE task_jobs SET status='done', updated_at=datetime('now') WHERE task_id = ?").run(taskId)
                    continue
                }

                this.active++
                this.run(taskId)
            }
        } catch (e) {
            console.error('[Queue] Failed to pump task queue:', e)
        } finally {
            this.pumping = false
        }
    }

    private run(taskId: string) {
        const heartbeat = setInterval(() => {
            try {
                useDb().prepare("UPDATE task_jobs SET heartbeat_at=datetime('now'), updated_at=datetime('now') WHERE task_id = ? AND status='running'").run(taskId)
            } catch { /* ignore heartbeat failures */ }
        }, 10_000)
        this.heartbeats.set(taskId, heartbeat)

        TaskService.process(taskId, this.runtimeConfigs.get(taskId))
            .then(() => this.persistJobResult(taskId))
            .catch((error) => this.handleUnexpectedFailure(taskId, error))
            .finally(() => {
                clearInterval(heartbeat)
                this.heartbeats.delete(taskId)
                this.runtimeConfigs.delete(taskId)
                this.active = Math.max(0, this.active - 1)
                void this.kick()
            })
    }

    private persistJobResult(taskId: string) {
        try {
            const task = useDb().prepare('SELECT status FROM tasks WHERE task_id = ?').get(taskId) as { status?: string } | undefined
            const status = String(task?.status || 'error')
            const jobStatus = status === 'done' || status === 'review'
                ? 'done'
                : status === 'cancelled'
                    ? 'cancelled'
                    : 'error'
            useDb().prepare("UPDATE task_jobs SET status=?, locked_by=NULL, locked_at=NULL, updated_at=datetime('now') WHERE task_id = ?").run(jobStatus, taskId)
        } catch { /* ignore job persistence failures */ }
    }

    private handleUnexpectedFailure(taskId: string, error: any) {
        const message = String(error?.message || error || 'unknown queue error')
        console.error(`[Queue] Task ${taskId} failed unexpectedly:`, error)
        try {
            const db = useDb()
            const job = db.prepare('SELECT attempts, max_attempts FROM task_jobs WHERE task_id = ?').get(taskId) as { attempts?: number, max_attempts?: number } | undefined
            const attempts = Number(job?.attempts || 1)
            const maxAttempts = Number(job?.max_attempts || 3)
            if (attempts < maxAttempts) {
                db.prepare("UPDATE task_jobs SET status='queued', next_run_at=datetime('now', ?), locked_by=NULL, locked_at=NULL, last_error=?, updated_at=datetime('now') WHERE task_id = ?")
                    .run(`+${Math.min(300, 15 * attempts)} seconds`, message, taskId)
            } else {
                db.prepare("UPDATE task_jobs SET status='error', last_error=?, locked_by=NULL, locked_at=NULL, updated_at=datetime('now') WHERE task_id = ?").run(message, taskId)
            }
        } catch { /* ignore */ }
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
    translationContext?: TranslationContext
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
                provider, unresolvedEntries, targetLanguage, glossary, previousContext, model, taskId, chunkIndex, stylePrompt, callbacks, streamUsage, attempt, useStreaming, signal, translationContext
            )
            assertTaskNotCancelled(taskId)

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
    const lowAsrConfidence = entry.asrConfidence !== undefined && Number(entry.asrConfidence) > 0 && Number(entry.asrConfidence) < 0.6
    if (lowAsrConfidence && !reviewReasons.includes('low_asr_confidence')) {
        reviewReasons.push('low_asr_confidence')
    }
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
    if (issueList.length > 0 || lowAsrConfidence) {
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
        task_id, subtitle_id, start_time, end_time, original_text, translated_text, final_text, review_status, review_reasons, asr_confidence, quality_score, quality_issues, sort_order, selected, edited, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, datetime('now'), datetime('now'))
      ON CONFLICT(task_id, subtitle_id) DO UPDATE SET
        start_time=excluded.start_time,
        end_time=excluded.end_time,
        original_text=excluded.original_text,
        translated_text=excluded.translated_text,
        final_text=excluded.final_text,
        review_status=excluded.review_status,
        review_reasons=excluded.review_reasons,
        asr_confidence=excluded.asr_confidence,
        quality_score=excluded.quality_score,
        quality_issues=excluded.quality_issues,
        sort_order=excluded.sort_order,
        updated_at=datetime('now')
    `)

    entries.forEach((entry, index) => {
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
            JSON.stringify(review.reviewReasons || []),
            entry.asrConfidence ?? null,
            entry.qualityScore ?? null,
            JSON.stringify(entry.qualityIssues || []),
            index
        )
    })
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

function findExternalSubtitle(videoAbsolutePath: string, rootPath: string): string | null {
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
                const aExt = a.name.toLowerCase().match(/\.[^.]+$/)?.[0] || ''
                const bExt = b.name.toLowerCase().match(/\.[^.]+$/)?.[0] || ''
                return priority.indexOf(aExt) - priority.indexOf(bExt) || a.name.localeCompare(b.name)
            })
        return candidates[0] ? relative(rootPath, join(dirname(videoAbsolutePath), candidates[0].name)).replaceAll('\\', '/') : null
    } catch {
        return null
    }
}

export const TaskService = {
    async createTask(task: Partial<TranslationTask>): Promise<TranslationTask> {
        const db = useDb()
        const stmt = db.prepare(`
      INSERT INTO tasks (
        task_id, file_path, root_id, source_type, track_index, model, target_lang, output_mode, style_preset, style_prompt, source_lang, source_subtitle_path, asr_run_id, asr_confidence, origin, watch_event_id, content_title, content_background, custom_instructions, translation_mode, subtitle_format, subtitle_style_preset, bilingual_layout, force_retranslate, status, progress, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
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
            task.origin === 'automation' ? 'automation' : 'manual',
            task.watchEventId || null,
            task.contentTitle || null,
            task.contentBackground || null,
            task.customInstructions || null,
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
            stylePrompt: task.style_prompt || '',
            sourceLanguage: task.source_lang || '',
            sourceSubtitlePath: task.source_subtitle_path || '',
            asrRunId: task.asr_run_id || undefined,
            asrConfidence: task.asr_confidence ?? undefined,
            origin: task.origin === 'automation' ? 'automation' : 'manual',
            watchEventId: task.watch_event_id || undefined,
            contentTitle: task.content_title || '',
            contentBackground: task.content_background || '',
            customInstructions: task.custom_instructions || '',
            translationMode: task.translation_mode || 'non_stream',
            subtitleFormat: task.subtitle_format || 'srt',
            subtitleStylePreset: task.subtitle_style_preset || 'bilingual_simple',
            bilingualLayout: task.bilingual_layout || 'translated_first',
            forceRetranslate: !!task.force_retranslate,
            stepProgress: Number(task.step_progress || 0),
            stepMessage: task.step_message || '',
            totalChunks: task.total_chunks,
            completedChunks: task.done_chunks,
            createdAt: task.created_at,
            updatedAt: task.updated_at
        }
    },

    async updateStatus(taskId: string, status: TaskStatus, progress: number, data: any = {}) {
        const db = useDb()
        const existing = db.prepare('SELECT status, progress, total_chunks, step_progress, step_message FROM tasks WHERE task_id = ?').get(taskId) as { status?: string, progress?: number, total_chunks?: number, step_progress?: number, step_message?: string | null } | undefined
        const currentStatus = String(existing?.status || '')

        if ((currentStatus === 'cancelled' && status !== 'cancelled') || (currentStatus === 'review' && status !== 'review')) {
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

        const stmt = db.prepare('UPDATE tasks SET status = ?, progress = ?, done_chunks = COALESCE(?, done_chunks), step_progress = ?, step_message = ?, updated_at = datetime(\'now\') WHERE task_id = ?')
        stmt.run(status, progress, completedChunks, stepProgress, stepMessage, taskId)

        const payload: any = { taskId, step: status, progress, ...data, stepProgress, stepMessage }

        if (data.log) {
            const level = status === 'error' ? 'error' : (data.level || 'info')
            const category = data.category || resolveLogCategory(status, level, data.log)
            writeTaskLog(taskId, status, level, data.log, category)
            taskEvents.emit('progress', { ...payload, level, category })
            if (status === 'done' || status === 'error' || status === 'cancelled') {
                taskEvents.emit(status, { ...payload, level, category, final: true })
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
        const signal = abortController.signal
        const tempDir = join(process.cwd(), 'temp')
        let taskForCleanup: TranslationTask | null = null
        let srtPath = ''
        let audioPath = ''
        let keepAsrAudio = false
        let taskSucceeded = false
        let runtimeConfig: { apiKey: string, baseUrl?: string } | null = openaiConfig || null

        try {
            const task = this.getTask(taskId)
            runtimeConfig = runtimeConfig || await ConfigService.getConfig()
            taskForCleanup = task
            const root = await getMediaRoot(task.rootId)

            if (!existsSync(tempDir)) {
                mkdirSync(tempDir, { recursive: true })
            }

            const db = useDb()
            if (task.sourceType === 'auto') {
                await this.updateStatus(taskId, 'probing', 5, { stepProgress: 0, stepMessage: '正在分析媒体字幕与音频轨道...', log: '正在分析媒体字幕与音频轨道...' })
                const media = await VideoService.probeMedia(task.filePath, task.rootId)
                const autoConfig = await ConfigService.getConfig()
                const subtitleTrack = media.subtitleTracks.find(track => track.isSupported)
                const bitmapTrack = media.subtitleTracks.find(track => ['hdmv_pgs_subtitle', 'pgssub', 'dvd_subtitle', 'dvdsub', 'dvb_subtitle', 'xsub'].includes(String(track.codec || '').toLowerCase()))
                if (subtitleTrack) {
                    task.sourceType = 'embedded'
                    task.trackIndex = subtitleTrack.index
                } else {
                    const root = await getMediaRoot(task.rootId)
                    const videoAbsolute = await resolveMediaPath(task.filePath, task.rootId)
                    const externalSubtitle = findExternalSubtitle(videoAbsolute, root.path)
                    if (externalSubtitle) {
                        task.sourceType = 'external'
                        task.sourceSubtitlePath = externalSubtitle
                        task.trackIndex = 0
                    } else if (bitmapTrack && autoConfig.ocrEnabled) {
                        task.sourceType = 'ocr'
                        task.trackIndex = bitmapTrack.index
                    } else {
                    const audioTrack = media.audioTracks.find(track => track.isDefault) || media.audioTracks[0]
                    if (!audioTrack) {
                        throw new Error(bitmapTrack
                            ? '发现图像字幕但 OCR 未启用，且没有可用音频轨道'
                            : '未发现可用的文本字幕轨道或音频轨道')
                    }
                        task.sourceType = 'asr'
                        task.trackIndex = audioTrack.index
                    }
                }
                db.prepare('UPDATE tasks SET source_type = ?, source_subtitle_path = ?, track_index = ?, updated_at = datetime(\'now\') WHERE task_id = ?')
                    .run(task.sourceType, task.sourceSubtitlePath || null, task.trackIndex, taskId)
                await this.updateStatus(taskId, 'probing', 8, {
                    stepProgress: 100,
                    stepMessage: task.sourceType === 'asr'
                        ? '未发现文本字幕，将使用语音识别。'
                        : task.sourceType === 'ocr'
                            ? '发现图像字幕，将使用 OCR 识别。'
                            : task.sourceType === 'external'
                                ? '发现外挂字幕，将直接使用外挂字幕。'
                                : '发现文本字幕，将直接提取字幕。',
                    log: task.sourceType === 'asr'
                        ? '未发现文本字幕，将使用语音识别。'
                        : task.sourceType === 'ocr'
                            ? '发现图像字幕，将使用 OCR 识别。'
                            : task.sourceType === 'external'
                                ? '发现外挂字幕，将直接使用外挂字幕。'
                                : '发现文本字幕，将直接提取字幕。'
                })
            }

            srtPath = task.sourceType === 'external'
                ? await resolveMediaPath(task.sourceSubtitlePath || task.filePath, task.rootId)
                : task.sourceType === 'asr'
                    ? ''
                    : join(tempDir, `${taskId}.srt`)
            const baseName = task.filePath.replace(/\.[^.]+$/, '')
            const cleanName = baseName.replace(/\.[a-zA-Z]{2,}(-[a-zA-Z]{2,})?$/, '')
            const outputExt = task.subtitleFormat === 'both' ? 'ass' : (task.subtitleFormat || 'srt')
            const outputSuffix = task.outputMode === 'original' ? 'original' : task.targetLanguage
            const inputPath = await resolveMediaPath(task.filePath, task.rootId)
            const outputBaseName = basename(cleanName)
            const config = await ConfigService.getConfig()
            const embyCompatible = config.embyCompatibleOutput === true && task.sourceType !== 'external'
            const outputPath = embyCompatible
                ? join(dirname(inputPath), `${outputBaseName}.${outputExt}`)
                : join(dirname(inputPath), `${outputBaseName}.${outputSuffix}.${outputExt}`)
            const embyVariantPath = embyCompatible
                ? join(dirname(inputPath), 'SubX', `${outputBaseName}.${outputSuffix}.${outputExt}`)
                : ''
            keepAsrAudio = Boolean(config.asrKeepAudio)
            let allEntries: SubtitleEntry[] = []

            assertTaskNotCancelled(taskId)
            if (task.sourceType === 'ocr') {
                if (!config.ocrEnabled) {
                    throw new Error('OCR 未启用，请先在设置中开启图像字幕 OCR 并配置 OCR 服务地址')
                }
                await this.updateStatus(taskId, 'ocr', 12, { stepProgress: 0, stepMessage: '正在识别图像字幕（PGS/VobSub/DVD）...', log: '正在识别图像字幕（PGS/VobSub/DVD）...' })
                const ocrResult = await OcrService.transcribe(inputPath, {
                    baseUrl: config.ocrBaseUrl || process.env.OCR_INTERNAL_URL || 'http://127.0.0.1:8001',
                    language: config.ocrLanguage || 'en',
                    apiKey: config.ocrApiKey || '',
                    trackIndex: task.trackIndex ?? 0,
                    onProgress: (progress, message) => {
                        const stepProgress = Math.max(0, Math.min(100, Number(progress) || 0))
                        const mapped = 12 + Math.round(stepProgress * 0.08)
                        void this.updateStatus(taskId, 'ocr', mapped, { stepProgress, stepMessage: message, currentText: message })
                    }
                }, signal)
                const persisted = AsrService.persistResult(taskId, ocrResult)
                allEntries = AsrService.toSubtitleEntries(ocrResult)
                if (allEntries.length === 0) {
                    throw new Error('OCR 未生成有效字幕')
                }
                task.sourceLanguage = ocrResult.language
                task.asrRunId = persisted.runId
                task.asrConfidence = persisted.confidence
                db.prepare('UPDATE tasks SET source_lang = ?, asr_run_id = ?, asr_confidence = ?, updated_at = datetime(\'now\') WHERE task_id = ?')
                    .run(ocrResult.language, persisted.runId, persisted.confidence, taskId)
                await this.updateStatus(taskId, 'parsing', 22, {
                    stepProgress: 100,
                    stepMessage: `OCR 完成：${allEntries.length} 条`,
                    log: `OCR 完成：${allEntries.length} 条`
                })
            } else if (task.sourceType === 'asr') {
                if (!config.asrEnabled) {
                    throw new Error('语音识别未启用，请先在设置中开启语音识别并配置 ASR 服务地址')
                }
                await this.updateStatus(taskId, 'extracting_audio', 8, {
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
                        void this.updateStatus(taskId, 'extracting_audio', 8 + Math.round(stepProgress * 0.08), {
                            stepProgress,
                            stepMessage: message,
                            currentText: message
                        })
                    }
                )
                await this.updateStatus(taskId, 'transcribing', 16, {
                    stepProgress: 0,
                    stepMessage: '音频已就绪，正在启动语音识别...',
                    currentText: '音频已就绪，正在启动语音识别...',
                    log: '正在使用本地语音识别生成字幕...'
                })

                const asrResult = await AsrService.transcribe(audioPath, {
                    baseUrl: config.asrBaseUrl || process.env.ASR_INTERNAL_URL || 'http://127.0.0.1:8000',
                    apiKey: config.asrApiKey,
                    model: config.asrModel || 'small',
                    device: config.asrDevice || 'auto',
                    computeType: config.asrComputeType || 'int8',
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
                        void this.updateStatus(taskId, 'transcribing', 16 + Math.round(stepProgress * 0.12), {
                            stepProgress,
                            stepMessage: message,
                            currentText: message
                        })
                    }
                }, signal)
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
                await this.updateStatus(taskId, 'parsing', 28, {
                    stepProgress: 100,
                    stepMessage: `语音识别完成：${allEntries.length} 条`,
                    log: `语音识别完成：语言 ${asrResult.language}，${allEntries.length} 条，平均置信度 ${(persisted.confidence * 100).toFixed(1)}%`
                })
            } else {
                await this.updateStatus(taskId, 'extracting', 10, { stepProgress: 0, stepMessage: '正在从原视频中提取字幕流...', log: '正在从原视频中提取字幕流...' })
                if (task.sourceType === 'embedded') {
                    assertTaskNotCancelled(taskId)
                    await VideoService.extractSubtitle(task.filePath, task.trackIndex!, srtPath, task.rootId)
                    await this.updateStatus(taskId, 'extracting', 15, { stepProgress: 100, stepMessage: '字幕提取成功', log: '字幕提取成功，保存至临时文件。' })
                } else {
                    await this.updateStatus(taskId, 'extracting', 15, { stepProgress: 100, stepMessage: '使用外部字幕文件', log: '使用外部字幕文件。' })
                }

                assertTaskNotCancelled(taskId)
                await this.updateStatus(taskId, 'parsing', 20, { stepProgress: 0, stepMessage: '正在解析 SRT 并进行智能分块...', log: '正在解析 SRT 并进行智能分块...' })
                allEntries = await SubtitleService.parseSubtitle(srtPath)
            }

            const chunkSize = Math.min(50000, Math.max(500, config.chunkSize || 5000))
            const subtitleFormat = task.subtitleFormat || config.subtitleFormat || 'srt'
            const subtitleStylePreset = task.subtitleStylePreset || config.subtitleStylePreset || 'bilingual_simple'
            const bilingualLayout = task.bilingualLayout || config.bilingualLayout || 'translated_first'
            console.log(`[Task] Using chunk size: ${chunkSize}`)

            const initialChunks = SubtitleService.chunkByTokens(allEntries, chunkSize)
            const chunks = initialChunks
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
                const savedPath = await SubtitleService.writeSubtitle(originalEntries, outputPath, 'original', subtitleFormat as any, subtitleStylePreset, bilingualLayout as any, srtPath)
                if (embyVariantPath) {
                    await SubtitleService.writeSubtitle(originalEntries, embyVariantPath, 'original', subtitleFormat as any, subtitleStylePreset, bilingualLayout as any, srtPath)
                }
                await this.updateStatus(taskId, 'exporting', 95, { stepProgress: 100, stepMessage: '文件保存成功', log: `文件保存成功: ${savedPath}` })
                db.prepare('UPDATE tasks SET output_path = ?, updated_at = datetime(\'now\') WHERE task_id = ?').run(savedPath, taskId)
                taskSucceeded = true
                await this.updateStatus(taskId, 'done', 100, { stepProgress: 100, stepMessage: '任务完成' })
                return
            }

            await this.updateStatus(taskId, 'translating', 30, {
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
            // Chunks execute serially so the rolling context always comes from the previous chunk.
            const limit = pLimit(1)
            const maxRetries = config.maxRetries || 3

            const glossary = config.glossary || {}

            const allStylePresets = [...STYLE_PRESETS, ...(Array.isArray(config.customStylePresets) ? config.customStylePresets : [])]
            const stylePresetConfig = allStylePresets.find(s => s.id === task.stylePreset)
            const stylePrompt = String(task.stylePrompt || stylePresetConfig?.prompt || '')
            const translationContext: TranslationContext = {
                title: task.contentTitle,
                background: task.contentBackground,
                instructions: task.customInstructions
            }
            if (stylePrompt) {
                await this.updateStatus(taskId, 'translating', 30, { log: `使用翻译风格: ${stylePresetConfig?.name || task.stylePreset}` })
            }
            if (translationContext.title || translationContext.background || translationContext.instructions) {
                await this.updateStatus(taskId, 'translating', 30, { log: '已附加片名/背景/额外要求到翻译上下文。' })
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
                const stepProgress = totalChunks > 0 ? Math.floor((globalCompletedChunks / totalChunks) * 100) : 100
                const progress = 30 + Math.floor(stepProgress * 0.6)
                this.updateStatus(taskId, 'translating', progress, {
                    totalChunks,
                    completedChunks: globalCompletedChunks,
                    stepProgress,
                    stepMessage: `已翻译 ${globalCompletedChunks}/${totalChunks} 个文本块`,
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
                const effectiveStylePromptForCache = stylePrompt
                const contextCacheKey = [task.contentTitle, task.contentBackground, task.customInstructions].filter(Boolean).join('|')
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
                    const cacheHash = SubtitleService.computeCacheHash(sourceText, task.model, task.targetLanguage, { glossary, stylePrompt: effectiveStylePromptForCache, promptVersion: TRANSLATION_PROMPT_VERSION, outputMode: task.outputMode, context: contextCacheKey })
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
                        translationContext
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
                            const cacheHash = SubtitleService.computeCacheHash(originalEntry.text, task.model, task.targetLanguage, { glossary, stylePrompt, promptVersion: TRANSLATION_PROMPT_VERSION, outputMode: task.outputMode, context: contextCacheKey })
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
            await this.updateStatus(taskId, 'exporting', 90, { stepProgress: 0, stepMessage: '正在合成并保存最终字幕文件...', log: '正在合成并保存最终字幕文件...' })
            let translatedEntries = Array.from(translatedMap.values())
            translatedEntries.sort((a, b) => Number(a.id) - Number(b.id))

            if ((task.outputMode as string) !== 'original') {
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
                let allIssues: Array<{ id: string, reason: string, severity?: 'soft' | 'hard' }> = issues

                if (config.qualityCheckEnabled === true && config.qualityCheckModel && config.qualityCheckModel !== task.model) {
                    try {
                        await this.updateStatus(taskId, 'translating', 87, { log: `正在进行双模型质量校验：${config.qualityCheckModel}` })
                        const quality = await QualityService.evaluate(taskId, translatedEntries, {
                            providerType: String((config as any).providerType || 'openai-compatible'),
                            apiKey: runtimeConfig.apiKey,
                            baseUrl: runtimeConfig.baseUrl,
                            model: config.qualityCheckModel,
                            targetLanguage: task.targetLanguage,
                            threshold: Number(config.qualityScoreThreshold ?? 0.7),
                            maxEntries: Number(config.qualityCheckMaxEntries ?? 200),
                            stylePrompt: stylePrompt,
                            context: translationContext
                        }, signal)
                        for (const entry of translatedEntries) {
                            const score = quality.scores.get(String(entry.id))
                            if (score) {
                                entry.qualityScore = score.score
                                entry.qualityIssues = score.issues
                            }
                        }
                        allIssues = [...allIssues, ...quality.issues]
                        writeTaskLog(taskId, 'exporting', quality.issues.length ? 'warn' : 'info', `[质量] 双模型校验 ${quality.checked} 条，平均评分 ${(quality.avgScore * 100).toFixed(1)}，低于阈值 ${quality.issues.length} 条`)
                    } catch (qualityError: any) {
                        writeTaskLog(taskId, 'exporting', 'warn', `[质量] 双模型校验失败，已跳过：${qualityError?.message || qualityError}`)
                    }
                }

                if (allIssues.length > 0) {
                    const preview = allIssues.slice(0, 5).map(issue => `#${issue.id}:${issue.reason}`).join(', ')
                    persistReviewEntries(taskId, translatedEntries, allIssues)
                    writeTaskLog(taskId, 'exporting', 'warn', `[核对] 检测到 ${allIssues.length} 条字幕需注意：${preview}`)
                } else {
                    persistReviewEntries(taskId, translatedEntries, [])
                }
            }

            assertTaskNotCancelled(taskId)
            const savedPath = await SubtitleService.writeSubtitle(translatedEntries, outputPath, task.outputMode as 'translated' | 'bilingual' | 'original', subtitleFormat as any, subtitleStylePreset, bilingualLayout as any, srtPath)
            if (embyVariantPath) {
                await SubtitleService.writeSubtitle(translatedEntries, embyVariantPath, task.outputMode as 'translated' | 'bilingual' | 'original', subtitleFormat as any, subtitleStylePreset, bilingualLayout as any, srtPath)
            }
            await this.updateStatus(taskId, 'exporting', 95, { stepProgress: 100, stepMessage: '文件保存成功', log: `文件保存成功: ${savedPath}${embyVariantPath ? '（SubX/ 变体已同步）' : ''}` })

            TranslationService.cleanupPartialFiles(taskId, totalChunks)

            db.prepare('UPDATE tasks SET output_path = ?, updated_at = datetime(\'now\') WHERE task_id = ?').run(savedPath, taskId)
            taskSucceeded = true
            await this.updateStatus(taskId, 'done', 100, { stepProgress: 100, stepMessage: '任务完成' })
            console.log(`[Task] 完成任务: ${taskId} 输出: ${savedPath}`)

        } catch (e: any) {
            if (e instanceof TaskCancelledError || isTaskCancelled(taskId)) {
                await this.updateStatus(taskId, 'cancelled', Number(taskForCleanup?.progress || 0), {
                    error: '用户取消任务',
                    stepMessage: '任务已取消',
                    log: '任务已取消，后台执行已停止。',
                    level: 'warn'
                })
                useDb().prepare("UPDATE tasks SET status = 'cancelled', error = ?, updated_at = datetime('now') WHERE task_id = ?").run('用户取消任务', taskId)
                return
            }

            const message = e?.message || 'Unknown error'
            const classified = classifyTaskError(message)
            const maskedKey = runtimeConfig?.apiKey ? `${runtimeConfig.apiKey.substring(0, 6)}...` : 'MISSING'
            console.error('\n' + '='.repeat(50))
            console.error(`[DEBUG] 任务失败详情 - Task ID: ${taskId}`)
            console.error(`[DEBUG] 接口地址 (Base URL): ${runtimeConfig?.baseUrl || 'https://api.openai.com/v1'}`)
            console.error(`[DEBUG] API Key (前6位): ${maskedKey}`)
            console.error(`[DEBUG] 使用模型: ${taskForCleanup?.model || 'unknown'}`)
            console.error(`[DEBUG] 目标语言: ${taskForCleanup?.targetLanguage || 'unknown'}`)
            console.error(`[DEBUG] 错误信息: ${message}`)
            if (e.response?.data) {
                console.error(`[DEBUG] API 响应详情: ${JSON.stringify(e.response.data)}`)
            }
            console.error('='.repeat(50) + '\n')

            await this.updateStatus(taskId, 'error', Number(taskForCleanup?.progress || 0), {
                error: `${classified.summary} (${message})`,
                stepMessage: classified.summary,
                log: `!!! 任务失败: ${classified.summary}${e.stack ? '\n堆栈信息: ' + e.stack.split('\n').slice(0, 3).join('\n') : ''}`
            })
            useDb().prepare('UPDATE tasks SET status = \'error\', error = ?, updated_at = datetime(\'now\') WHERE task_id = ?').run(`${classified.summary} (${message})`, taskId)
        } finally {
            cancelledTaskIds.delete(taskId)
            taskAbortControllers.delete(taskId)
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
