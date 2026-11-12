import { join } from 'path'
import { existsSync } from 'fs'
import { useDb } from './db'
import type { AppConfig, MediaRoot } from '../../types'
import { decryptSecret, encryptSecret, isEncryptedSecret } from './secret'
import { getActiveTaskIds } from './activeTasks'
import { isAudioInUse } from './asr/audioCache'
import { createSubtitleStyle, normalizeSubtitleStyle } from '../../shared/subtitleStyles'

let lastLogCleanupAt = 0
let configCache: AppConfig | null = null
let configCacheAt = 0
const CONFIG_CACHE_TTL_MS = 5000
const LOCAL_ASR_URL = String(process.env.ASR_INTERNAL_URL || 'http://127.0.0.1:8000')
const LOCAL_OCR_URL = String(process.env.OCR_INTERNAL_URL || 'http://127.0.0.1:8001')
const LOCAL_SERVICE_MIGRATION_KEY = 'subxLocalServiceMigration'
let localServiceMigrationChecked = false
let asrEnvOverrideWarned = false
let ocrEnvOverrideWarned = false

function safeJsonParse<T>(value: unknown, fallback: T): T {
    try {
        return JSON.parse(String(value ?? '')) as T
    } catch {
        return fallback
    }
}

/**
 * Redact raw LLM payloads from task_responses older than the retention window
 * without deleting the row. Metadata, token counts and identifiers are kept.
 */
export function redactExpiredTaskResponses(db: any, retentionDays: number): number {
    const days = Math.max(1, Number(retentionDays) || 7)
    const result = db.prepare(`
        UPDATE task_responses
        SET raw_request = NULL, raw_response = NULL
        WHERE created_at < datetime('now', ?)
          AND (raw_request IS NOT NULL OR raw_response IS NOT NULL)
    `).run(`-${days} days`)
    return Number(result?.changes ?? 0)
}

export const ConfigService = {
    /**
     * Get all configuration
     */
    async getConfig(forceFresh = false): Promise<AppConfig> {
        const now = Date.now()
        if (!forceFresh && configCache && now - configCacheAt < CONFIG_CACHE_TTL_MS) {
            return { ...configCache, glossary: { ...configCache.glossary }, mediaRoots: Array.isArray(configCache.mediaRoots) ? [...configCache.mediaRoots] : [], customStylePresets: Array.isArray(configCache.customStylePresets) ? [...configCache.customStylePresets] : [], subtitleStyle: configCache.subtitleStyle ? normalizeSubtitleStyle(configCache.subtitleStyle, String(configCache.outputMode || 'bilingual')) : undefined }
        }

        const db = useDb()
        const rows = db.prepare('SELECT key, value FROM config').all() as any[]

        // Default values
        const config: AppConfig = {
            apiKey: '',
            apiBaseUrl: 'https://api.openai.com/v1',
            providerType: 'openai-compatible',
            defaultModel: 'gpt-3.5-turbo',
            fallbackProviderEnabled: false,
            fallbackProviderType: 'openai-compatible',
            fallbackApiBaseUrl: 'https://api.openai.com/v1',
            fallbackApiKey: '',
            fallbackModel: '',
            targetLanguage: 'zh-CN',
            chunkSize: 2000,
            concurrency: 3,
            maxRetries: 3,
            translationMode: 'non_stream',
            streamUsage: false,
            logRetentionDays: 7,
            autoBackupEnabled: false,
            autoBackupIntervalHours: 24,
            autoBackupKeep: 10,
            glossary: {},
            mediaRoots: [],
            customStylePresets: [],
            outputMode: 'translated',
            stylePreset: 'default',
            subtitleFormat: 'srt',
            subtitleStylePreset: 'mono_clean',
            subtitleStyle: createSubtitleStyle('mono_clean', 'translated'),
            bilingualLayout: 'translated_first',
            asrEnabled: false,
            asrBaseUrl: LOCAL_ASR_URL,
            asrApiKey: String(process.env.ASR_API_KEY || ''),
            asrModel: String(process.env.ASR_MODEL || 'small'),
            asrLanguage: 'auto',
            asrDevice: String(process.env.ASR_DEVICE || 'auto'),
            asrComputeType: String(process.env.ASR_COMPUTE_TYPE || 'int8'),
            asrUploadTimeoutMs: Number(process.env.ASR_UPLOAD_TIMEOUT_MS || 30 * 60 * 1000),
            asrPollTimeoutMs: Number(process.env.ASR_POLL_TIMEOUT_MS || 30 * 1000),
            asrJobIdleTimeoutMs: Number(process.env.ASR_JOB_IDLE_TIMEOUT_MS || 30 * 60 * 1000),
            asrJobAbsoluteTimeoutMs: Number(process.env.ASR_JOB_ABSOLUTE_TIMEOUT_MS || 6 * 60 * 60 * 1000),
            asrChunkSeconds: Number(process.env.ASR_CHUNK_SECONDS || 300),
            asrChunkOverlapSeconds: Number(process.env.ASR_CHUNK_OVERLAP_SECONDS || 2),
            asrResumeTtlHours: Number(process.env.ASR_RESUME_TTL_HOURS || 168),
            asrVad: true,
            asrWordTimestamps: true,
            asrKeepAudio: false,
            asrEngine: String(process.env.ASR_ENGINE || 'auto') as AppConfig['asrEngine'],
            asrPreprocess: String(process.env.ASR_PREPROCESS || 'off') as AppConfig['asrPreprocess'],
            asrDiarization: false,
            asrCloudEnabled: false,
            asrCloudBaseUrl: 'https://api.openai.com/v1',
            asrCloudApiKey: '',
            asrCloudModel: 'whisper-1',
            asrCloudFallback: true,
            ocrEnabled: false,
            ocrBaseUrl: LOCAL_OCR_URL,
            ocrApiKey: String(process.env.OCR_API_KEY || ''),
            ocrLanguage: String(process.env.OCR_LANGUAGE || 'en'),
            ocrEngine: String(process.env.OCR_ENGINE || 'auto') as AppConfig['ocrEngine'],
            ocrMinConfidence: Number(process.env.OCR_MIN_CONFIDENCE || 25),
            ocrMaxSeconds: Number(process.env.OCR_MAX_SECONDS || 14400),
            ocrChunkSeconds: Number(process.env.OCR_CHUNK_SECONDS || 1800),
            ocrPgsripTimeoutSeconds: Number(process.env.OCR_PGSRIP_TIMEOUT_SECONDS || 7200),
            ocrFfmpegTimeoutSeconds: Number(process.env.OCR_FFMPEG_TIMEOUT_SECONDS || 3600),
            ocrChunkRetries: Number(process.env.OCR_CHUNK_RETRIES || 1),
            ocrResumeTtlHours: Number(process.env.OCR_RESUME_TTL_HOURS || 24),
            ocrJobIdleTimeoutMs: Number(process.env.OCR_JOB_IDLE_TIMEOUT_MS || 60 * 60 * 1000),
            ocrJobAbsoluteTimeoutMs: Number(process.env.OCR_JOB_ABSOLUTE_TIMEOUT_MS || 6 * 60 * 60 * 1000),
            automationConcurrency: 1,
            notificationEnabled: true,
            notificationLowConfidenceThreshold: 0.6,
            chineseVariantOutputEnabled: false,
            subtitleQualityEnabled: false,
            subtitleQualityMaxCharsPerLine: 20,
            subtitleQualityMaxLines: 2,
            subtitleQualityMaxCps: 20,
            subtitleQualityMinDurationMs: 700,
            subtitleQualityMaxDurationMs: 8000,
            subtitleQualityGapMs: 80,
            subtitleQualityAutoFixEnabled: false,
            translationMemoryEnabled: true,
            metadataEnabled: false,
            metadataAutoSearchEnabled: false,
            metadataProvider: 'tmdb',
            metadataApiKey: '',
            metadataLanguage: 'zh-CN',
            costBudgetEnabled: false,
            costBudgetMonthlyUsd: 0,
            costPricePromptPer1M: 0,
            costPriceCompletionPer1M: 0
        }

        // Override with DB values
        let hasSubtitleStyleRow = false
        rows.forEach(row => {
            if (row.key === 'glossary') {
                config.glossary = safeJsonParse<Record<string, string>>(row.value, {})
            } else if (row.key === 'mediaRoots') {
                config.mediaRoots = safeJsonParse<MediaRoot[]>(row.value, [])
            } else if (row.key === 'customStylePresets') {
                config.customStylePresets = safeJsonParse<AppConfig['customStylePresets']>(row.value, [])
            } else if (row.key === 'subtitleStyle') {
                hasSubtitleStyleRow = true
                config.subtitleStyle = safeJsonParse(row.value, config.subtitleStyle)
            } else if (['chunkSize', 'concurrency', 'maxRetries', 'logRetentionDays', 'automationConcurrency', 'notificationLowConfidenceThreshold', 'qualityScoreThreshold', 'qualityCheckMaxEntries', 'ocrMinConfidence', 'ocrMaxSeconds', 'ocrChunkSeconds', 'ocrPgsripTimeoutSeconds', 'ocrFfmpegTimeoutSeconds', 'ocrChunkRetries', 'ocrResumeTtlHours', 'ocrJobIdleTimeoutMs', 'ocrJobAbsoluteTimeoutMs', 'asrUploadTimeoutMs', 'asrPollTimeoutMs', 'asrJobIdleTimeoutMs', 'asrJobAbsoluteTimeoutMs', 'asrChunkSeconds', 'asrChunkOverlapSeconds', 'asrResumeTtlHours', 'autoBackupIntervalHours', 'autoBackupKeep', 'subtitleQualityMaxCharsPerLine', 'subtitleQualityMaxLines', 'subtitleQualityMaxCps', 'subtitleQualityMinDurationMs', 'subtitleQualityMaxDurationMs', 'subtitleQualityGapMs', 'costBudgetMonthlyUsd', 'costPricePromptPer1M', 'costPriceCompletionPer1M'].includes(row.key)) {
                (config as any)[row.key] = Number(row.value)
            } else if (row.key === 'streamUsage') {
                config.streamUsage = row.value === 'true' || row.value === '1'
            } else if (['asrEnabled', 'asrVad', 'asrWordTimestamps', 'asrKeepAudio', 'asrCloudEnabled', 'asrCloudFallback', 'asrDiarization', 'ocrEnabled', 'notificationEnabled', 'embyCompatibleOutput', 'qualityCheckEnabled', 'autoBackupEnabled', 'fallbackProviderEnabled', 'chineseVariantOutputEnabled', 'subtitleQualityEnabled', 'subtitleQualityAutoFixEnabled', 'translationMemoryEnabled', 'metadataEnabled', 'metadataAutoSearchEnabled', 'costBudgetEnabled'].includes(row.key)) {
                (config as any)[row.key] = row.value === 'true' || row.value === '1'
            } else if (row.key === 'translationMode') {
                config.translationMode = row.value === 'stream' ? 'stream' : 'non_stream'
            } else if (row.key === 'apiKey') {
                config.apiKey = String(row.value || '')
            } else if (row.key === 'asrApiKey') {
                config.asrApiKey = String(row.value || '')
            } else if (row.key === 'asrCloudApiKey') {
                config.asrCloudApiKey = String(row.value || '')
            } else if (row.key === 'fallbackApiKey') {
                config.fallbackApiKey = String(row.value || '')
            } else if (row.key === 'metadataApiKey') {
                config.metadataApiKey = String(row.value || '')
            } else if (row.key === 'ocrApiKey') {
                config.ocrApiKey = String(row.value || '')
            } else if (row.key === 'integrationWebhookToken') {
                config.integrationWebhookToken = String(row.value || '')
            } else {
                (config as any)[row.key] = row.value
            }
        })

        // 单镜像升级迁移只做一次，之后以用户保存的值为准。
        // 这样用户后续显式填写 http://subx-asr:8000 时不会被反复改写。
        if (!localServiceMigrationChecked) {
            localServiceMigrationChecked = true
            if (process.env.SUBX_ALL_IN_ONE === 'true' && process.env.SUBX_KEEP_LEGACY_SIDECAR_URLS !== 'true') {
                try {
                    const migrated = db.prepare('SELECT value FROM config WHERE key = ?').get(LOCAL_SERVICE_MIGRATION_KEY)
                    if (!migrated) {
                        const updates: Array<[string, string]> = []
                        const asrValue = String(config.asrBaseUrl || '').trim().replace(/\/+$/, '')
                        const ocrValue = String(config.ocrBaseUrl || '').trim().replace(/\/+$/, '')
                        if (asrValue === 'http://subx-asr:8000') {
                            config.asrBaseUrl = LOCAL_ASR_URL
                            updates.push(['asrBaseUrl', LOCAL_ASR_URL])
                        }
                        if (ocrValue === 'http://subx-ocr:8000') {
                            config.ocrBaseUrl = LOCAL_OCR_URL
                            updates.push(['ocrBaseUrl', LOCAL_OCR_URL])
                        }
                        const stmt = db.prepare("INSERT OR REPLACE INTO config (key, value, updated_at) VALUES (?, ?, datetime('now'))")
                        for (const [key, value] of updates) stmt.run(key, value)
                        stmt.run(LOCAL_SERVICE_MIGRATION_KEY, 'true')
                        if (updates.length) {
                            console.log('[Config] Migrated legacy sidecar URLs to built-in local services:', updates.map(([key]) => key).join(', '))
                        }
                    }
                } catch (e) {
                    console.error('[Config] Local service URL migration failed:', e)
                }
            }
        }

        // Lazy migration: encrypt legacy plaintext API keys at rest.
        if (config.apiKey && !isEncryptedSecret(config.apiKey)) {
            try {
                const encrypted = encryptSecret(config.apiKey)
                db.prepare("INSERT OR REPLACE INTO config (key, value, updated_at) VALUES ('apiKey', ?, datetime('now'))").run(encrypted)
            } catch (e) {
                console.error('[Config] Failed to encrypt legacy API key:', e)
            }
        } else if (isEncryptedSecret(config.apiKey)) {
            try {
                config.apiKey = decryptSecret(config.apiKey)
            } catch (e) {
                console.error('[Config] Failed to decrypt API key:', e)
                config.apiKey = ''
            }
        }

        const allInOne = process.env.SUBX_ALL_IN_ONE === 'true'
        const envAsrApiKey = String(process.env.ASR_API_KEY || '')
        if (config.asrApiKey && isEncryptedSecret(config.asrApiKey)) {
            try {
                config.asrApiKey = decryptSecret(config.asrApiKey)
            } catch (e) {
                console.error('[Config] Failed to decrypt ASR API key:', e)
                config.asrApiKey = ''
            }
        }
        if (allInOne && envAsrApiKey) {
            if (config.asrApiKey && config.asrApiKey !== envAsrApiKey && !asrEnvOverrideWarned) {
                asrEnvOverrideWarned = true
                console.warn('[Config] ASR_API_KEY env var takes precedence over the saved ASR API key in all-in-one mode')
            }
            config.asrApiKey = envAsrApiKey
        } else if (!config.asrApiKey && envAsrApiKey) {
            config.asrApiKey = envAsrApiKey
        }

        const envOcrApiKey = String(process.env.OCR_API_KEY || '')
        if (config.ocrApiKey && isEncryptedSecret(config.ocrApiKey)) {
            try {
                config.ocrApiKey = decryptSecret(config.ocrApiKey)
            } catch (e) {
                console.error('[Config] Failed to decrypt OCR API key:', e)
                config.ocrApiKey = ''
            }
        }
        if (allInOne && envOcrApiKey) {
            if (config.ocrApiKey && config.ocrApiKey !== envOcrApiKey && !ocrEnvOverrideWarned) {
                ocrEnvOverrideWarned = true
                console.warn('[Config] OCR_API_KEY env var takes precedence over the saved OCR API key in all-in-one mode')
            }
            config.ocrApiKey = envOcrApiKey
        } else if (!config.ocrApiKey && envOcrApiKey) {
            config.ocrApiKey = envOcrApiKey
        }

        if (config.integrationWebhookToken && isEncryptedSecret(config.integrationWebhookToken)) {
            try {
                config.integrationWebhookToken = decryptSecret(config.integrationWebhookToken)
            } catch (e) {
                console.error('[Config] Failed to decrypt integration token:', e)
                config.integrationWebhookToken = ''
            }
        }

        if (config.asrCloudApiKey && isEncryptedSecret(config.asrCloudApiKey)) {
            try {
                config.asrCloudApiKey = decryptSecret(config.asrCloudApiKey)
            } catch (e) {
                console.error('[Config] Failed to decrypt cloud ASR API key:', e)
                config.asrCloudApiKey = ''
            }
        }

        if (config.fallbackApiKey && isEncryptedSecret(config.fallbackApiKey)) {
            try {
                config.fallbackApiKey = decryptSecret(config.fallbackApiKey)
            } catch (e) {
                console.error('[Config] Failed to decrypt fallback translation API key:', e)
                config.fallbackApiKey = ''
            }
        }

        if (config.metadataApiKey && isEncryptedSecret(config.metadataApiKey)) {
            try {
                config.metadataApiKey = decryptSecret(config.metadataApiKey)
            } catch (e) {
                console.error('[Config] Failed to decrypt metadata API key:', e)
                config.metadataApiKey = ''
            }
        }

        const styleOutputMode = String(config.outputMode || 'bilingual')
        if (hasSubtitleStyleRow) {
            config.subtitleStyle = normalizeSubtitleStyle(config.subtitleStyle, styleOutputMode)
        } else if (config.subtitleStylePreset) {
            config.subtitleStyle = createSubtitleStyle(config.subtitleStylePreset, styleOutputMode)
        }
        if (config.subtitleStyle) {
            config.subtitleStyle = normalizeSubtitleStyle(config.subtitleStyle, styleOutputMode)
            config.subtitleStylePreset = config.subtitleStyle.presetId
        }

        configCache = {
            ...config,
            glossary: { ...config.glossary },
            mediaRoots: Array.isArray(config.mediaRoots) ? [...config.mediaRoots] : [],
            customStylePresets: Array.isArray(config.customStylePresets) ? [...config.customStylePresets] : [],
            subtitleStyle: config.subtitleStyle ? normalizeSubtitleStyle(config.subtitleStyle, String(config.outputMode || 'bilingual')) : undefined
        }
        configCacheAt = now

        return { ...configCache, glossary: { ...configCache.glossary }, mediaRoots: Array.isArray(configCache.mediaRoots) ? [...configCache.mediaRoots] : [], customStylePresets: Array.isArray(configCache.customStylePresets) ? [...configCache.customStylePresets] : [], subtitleStyle: configCache.subtitleStyle ? normalizeSubtitleStyle(configCache.subtitleStyle, String(configCache.outputMode || 'bilingual')) : undefined }
    },

    /**
     * Update configuration
     */
    async updateConfig(key: string, value: any) {
        const db = useDb()
        const normalizedValue = (key === 'apiKey' || key === 'asrApiKey' || key === 'asrCloudApiKey' || key === 'fallbackApiKey' || key === 'ocrApiKey' || key === 'integrationWebhookToken' || key === 'metadataApiKey') ? encryptSecret(String(value || '')) : value
        const valStr = typeof normalizedValue === 'object' ? JSON.stringify(normalizedValue) : String(normalizedValue)

        const stmt = db.prepare('INSERT OR REPLACE INTO config (key, value, updated_at) VALUES (?, ?, datetime(\'now\'))')
        stmt.run(key, valStr)
        configCache = null
        configCacheAt = 0
        console.log(`[Config] 更新配置: ${key} = ${['apiKey', 'asrApiKey', 'asrCloudApiKey', 'fallbackApiKey', 'ocrApiKey', 'integrationWebhookToken', 'metadataApiKey'].includes(key) ? '****' : valStr.substring(0, 40)}`)
    },

    async cleanupLogsIfNeeded() {
        const now = Date.now()
        if (now - lastLogCleanupAt < 6 * 60 * 60 * 1000) return
        lastLogCleanupAt = now
        await this.cleanupLogs()
    },

    /**
     * Cleanup old logs, temporary files and translation cache.
     */
    async cleanupLogs() {
        const config = await this.getConfig()
        const days = Math.max(1, Number(config.logRetentionDays) || 7)
        const maxAge = days * 24 * 60 * 60 * 1000
        const now = Date.now()
        const { readdirSync, statSync, rmSync } = await import('fs')

        const cleanupDir = (dir: string, match?: (name: string) => boolean, maxAgeOverride = maxAge) => {
            if (!existsSync(dir)) return
            for (const file of readdirSync(dir)) {
                if (match && !match(file)) continue
                const filePath = join(dir, file)
                try {
                    const stats = statSync(filePath)
                    if (stats.isFile() && now - stats.mtimeMs > maxAgeOverride) {
                        rmSync(filePath, { force: true })
                    }
                } catch (e) {
                    console.error(`[Config] Failed to cleanup ${filePath}:`, e)
                }
            }
        }

        const activeTaskIds = getActiveTaskIds()
        const belongsToActiveTask = (name: string) => activeTaskIds.some(id => name.includes(id))
        cleanupDir(join(process.cwd(), 'temp', 'ai-logs'), name => !belongsToActiveTask(name))
        cleanupDir(join(process.cwd(), 'temp'), name => (/\.(partial|srt|mp3)$/.test(name) || name.startsWith('download_orig_') || name.startsWith('clip_')) && !belongsToActiveTask(name))
        const audioCacheDays = Math.max(7, Number(process.env.ASR_AUDIO_CACHE_DAYS || 14))
        const asrAudioDir = join(process.cwd(), 'temp', 'asr-audio')
        cleanupDir(asrAudioDir, name => !isAudioInUse(join(asrAudioDir, name)), audioCacheDays * 24 * 60 * 60 * 1000)
        cleanupDir(join(process.cwd(), 'db', 'logs'), name => name.startsWith('task_') && name.endsWith('.log') && !belongsToActiveTask(name))

        try {
            const db = useDb()
            const modifier = `-${days} days`
            db.prepare("DELETE FROM task_logs WHERE created_at < datetime('now', ?)").run(modifier)
            db.prepare("DELETE FROM task_logs WHERE task_id NOT IN (SELECT task_id FROM tasks)").run()
            try { db.prepare("DELETE FROM review_jobs WHERE status IN ('done', 'error') AND updated_at < datetime('now', ?)").run(modifier) } catch { /* old schema */ }
            db.prepare("DELETE FROM task_responses WHERE task_id NOT IN (SELECT task_id FROM tasks)").run()
            redactExpiredTaskResponses(db, days)
            db.prepare("DELETE FROM task_review_entries WHERE task_id NOT IN (SELECT task_id FROM tasks)").run()
            try { db.prepare("DELETE FROM task_proofread_cache WHERE task_id NOT IN (SELECT task_id FROM tasks)").run() } catch { /* old schema */ }
            try { db.prepare("DELETE FROM translation_quality_entries WHERE task_id NOT IN (SELECT task_id FROM tasks)").run() } catch { /* old schema */ }
            try { db.prepare("DELETE FROM translation_quality_runs WHERE task_id NOT IN (SELECT task_id FROM tasks)").run() } catch { /* old schema */ }
            try { db.prepare("DELETE FROM asr_segments WHERE run_id IN (SELECT id FROM transcription_runs WHERE task_id NOT IN (SELECT task_id FROM tasks))").run() } catch { /* old schema */ }
            try { db.prepare("DELETE FROM transcription_runs WHERE task_id NOT IN (SELECT task_id FROM tasks)").run() } catch { /* old schema */ }
            db.prepare("DELETE FROM translations_cache WHERE updated_at < datetime('now', ?)").run(modifier)
            db.prepare("DELETE FROM api_audit_logs WHERE created_at < datetime('now', ?)").run(modifier)
            db.prepare("DELETE FROM notification_deliveries WHERE status IN ('sent', 'failed', 'skipped') AND created_at < datetime('now', ?)").run(modifier)
            try {
                const checkpointHours = Math.max(1, Number(config.asrResumeTtlHours || process.env.ASR_RESUME_TTL_HOURS || 168))
                db.prepare("DELETE FROM asr_checkpoints WHERE updated_at < datetime('now', ?)").run(`-${checkpointHours} hours`)
            } catch { /* old schema */ }
            db.prepare("DELETE FROM watch_events WHERE status IN ('done', 'failed', 'skipped', 'ignored') AND created_at < datetime('now', ?)").run(modifier)
            db.prepare("DELETE FROM integration_events WHERE created_at < datetime('now', ?)").run(modifier)
            db.prepare(`
                DELETE FROM translations_cache
                WHERE hash NOT IN (
                    SELECT hash FROM translations_cache ORDER BY updated_at DESC LIMIT 20000
                )
            `).run()
        } catch (e) {
            console.error('[Config] Failed to cleanup database logs/cache:', e)
        }
    }
}