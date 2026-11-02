import { join } from 'path'
import { existsSync } from 'fs'
import { useDb } from './db'
import type { AppConfig, MediaRoot } from '../../types'
import { decryptSecret, encryptSecret, isEncryptedSecret } from './secret'

let lastLogCleanupAt = 0
let configCache: AppConfig | null = null
let configCacheAt = 0
const CONFIG_CACHE_TTL_MS = 5000
const LOCAL_ASR_URL = String(process.env.ASR_INTERNAL_URL || 'http://127.0.0.1:8000')
const LOCAL_OCR_URL = String(process.env.OCR_INTERNAL_URL || 'http://127.0.0.1:8001')
const LOCAL_SERVICE_MIGRATION_KEY = 'subxLocalServiceMigration'
let localServiceMigrationChecked = false

export const ConfigService = {
    /**
     * Get all configuration
     */
    async getConfig(forceFresh = false): Promise<AppConfig> {
        const now = Date.now()
        if (!forceFresh && configCache && now - configCacheAt < CONFIG_CACHE_TTL_MS) {
            return { ...configCache, glossary: { ...configCache.glossary }, mediaRoots: Array.isArray(configCache.mediaRoots) ? [...configCache.mediaRoots] : [], customStylePresets: Array.isArray(configCache.customStylePresets) ? [...configCache.customStylePresets] : [] }
        }

        const db = useDb()
        const rows = db.prepare('SELECT key, value FROM config').all() as any[]

        // Default values
        const config: AppConfig = {
            apiKey: '',
            apiBaseUrl: 'https://api.openai.com/v1',
            providerType: 'openai-compatible',
            defaultModel: 'gpt-3.5-turbo',
            targetLanguage: 'zh-CN',
            chunkSize: 2000,
            concurrency: 3,
            maxRetries: 3,
            translationMode: 'non_stream',
            streamUsage: false,
            logRetentionDays: 7,
            glossary: {},
            mediaRoots: [],
            customStylePresets: [],
            asrEnabled: false,
            asrBaseUrl: LOCAL_ASR_URL,
            asrApiKey: String(process.env.ASR_API_KEY || ''),
            asrModel: String(process.env.ASR_MODEL || 'small'),
            asrLanguage: 'auto',
            asrDevice: String(process.env.ASR_DEVICE || 'auto'),
            asrComputeType: String(process.env.ASR_COMPUTE_TYPE || 'int8'),
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
            automationConcurrency: 1,
            notificationEnabled: true,
            notificationLowConfidenceThreshold: 0.6
        }

        // Override with DB values
        rows.forEach(row => {
            if (row.key === 'glossary') {
                config.glossary = JSON.parse(row.value)
            } else if (row.key === 'mediaRoots') {
                config.mediaRoots = JSON.parse(row.value) as MediaRoot[]
            } else if (row.key === 'customStylePresets') {
                config.customStylePresets = JSON.parse(row.value)
            } else if (['chunkSize', 'concurrency', 'maxRetries', 'logRetentionDays', 'automationConcurrency', 'notificationLowConfidenceThreshold', 'qualityScoreThreshold', 'qualityCheckMaxEntries'].includes(row.key)) {
                (config as any)[row.key] = Number(row.value)
            } else if (row.key === 'streamUsage') {
                config.streamUsage = row.value === 'true' || row.value === '1'
            } else if (['asrEnabled', 'asrVad', 'asrWordTimestamps', 'asrKeepAudio', 'asrCloudEnabled', 'asrCloudFallback', 'asrDiarization', 'ocrEnabled', 'notificationEnabled', 'embyCompatibleOutput', 'qualityCheckEnabled'].includes(row.key)) {
                (config as any)[row.key] = row.value === 'true' || row.value === '1'
            } else if (row.key === 'translationMode') {
                config.translationMode = row.value === 'stream' ? 'stream' : 'non_stream'
            } else if (row.key === 'apiKey') {
                config.apiKey = String(row.value || '')
            } else if (row.key === 'asrApiKey') {
                config.asrApiKey = String(row.value || '')
            } else if (row.key === 'asrCloudApiKey') {
                config.asrCloudApiKey = String(row.value || '')
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

        if (config.asrApiKey && isEncryptedSecret(config.asrApiKey)) {
            try {
                config.asrApiKey = decryptSecret(config.asrApiKey)
            } catch (e) {
                console.error('[Config] Failed to decrypt ASR API key:', e)
                config.asrApiKey = ''
            }
        }

        if (config.ocrApiKey && isEncryptedSecret(config.ocrApiKey)) {
            try {
                config.ocrApiKey = decryptSecret(config.ocrApiKey)
            } catch (e) {
                console.error('[Config] Failed to decrypt OCR API key:', e)
                config.ocrApiKey = ''
            }
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

        configCache = {
            ...config,
            glossary: { ...config.glossary },
            mediaRoots: Array.isArray(config.mediaRoots) ? [...config.mediaRoots] : [],
            customStylePresets: Array.isArray(config.customStylePresets) ? [...config.customStylePresets] : []
        }
        configCacheAt = now

        return { ...configCache, glossary: { ...configCache.glossary }, mediaRoots: Array.isArray(configCache.mediaRoots) ? [...configCache.mediaRoots] : [], customStylePresets: Array.isArray(configCache.customStylePresets) ? [...configCache.customStylePresets] : [] }
    },

    /**
     * Update configuration
     */
    async updateConfig(key: string, value: any) {
        const db = useDb()
        const normalizedValue = (key === 'apiKey' || key === 'asrApiKey' || key === 'asrCloudApiKey' || key === 'ocrApiKey' || key === 'integrationWebhookToken') ? encryptSecret(String(value || '')) : value
        const valStr = typeof normalizedValue === 'object' ? JSON.stringify(normalizedValue) : String(normalizedValue)

        const stmt = db.prepare('INSERT OR REPLACE INTO config (key, value, updated_at) VALUES (?, ?, datetime(\'now\'))')
        stmt.run(key, valStr)
        configCache = null
        configCacheAt = 0
        console.log(`[Config] 更新配置: ${key} = ${['apiKey', 'asrApiKey', 'asrCloudApiKey'].includes(key) ? '****' : valStr.substring(0, 40)}`)
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

        cleanupDir(join(process.cwd(), 'temp', 'ai-logs'))
        cleanupDir(join(process.cwd(), 'temp'), name => /\.(partial|srt|mp3)$/.test(name) || name.startsWith('download_orig_') || name.startsWith('clip_'))
        const audioCacheDays = Math.max(7, Number(process.env.ASR_AUDIO_CACHE_DAYS || 14))
        cleanupDir(join(process.cwd(), 'temp', 'asr-audio'), undefined, audioCacheDays * 24 * 60 * 60 * 1000)
        cleanupDir(join(process.cwd(), 'db', 'logs'), name => name.startsWith('task_') && name.endsWith('.log'))

        try {
            const db = useDb()
            const modifier = `-${days} days`
            db.prepare("DELETE FROM task_logs WHERE created_at < datetime('now', ?)").run(modifier)
            db.prepare("DELETE FROM task_logs WHERE task_id NOT IN (SELECT task_id FROM tasks)").run()
            db.prepare("DELETE FROM task_responses WHERE task_id NOT IN (SELECT task_id FROM tasks)").run()
            db.prepare("DELETE FROM task_review_entries WHERE task_id NOT IN (SELECT task_id FROM tasks)").run()
            try { db.prepare("DELETE FROM translation_quality_entries WHERE task_id NOT IN (SELECT task_id FROM tasks)").run() } catch { /* old schema */ }
            try { db.prepare("DELETE FROM translation_quality_runs WHERE task_id NOT IN (SELECT task_id FROM tasks)").run() } catch { /* old schema */ }
            try { db.prepare("DELETE FROM asr_segments WHERE run_id IN (SELECT id FROM transcription_runs WHERE task_id NOT IN (SELECT task_id FROM tasks))").run() } catch { /* old schema */ }
            try { db.prepare("DELETE FROM transcription_runs WHERE task_id NOT IN (SELECT task_id FROM tasks)").run() } catch { /* old schema */ }
            db.prepare("DELETE FROM translations_cache WHERE updated_at < datetime('now', ?)").run(modifier)
            db.prepare("DELETE FROM api_audit_logs WHERE created_at < datetime('now', ?)").run(modifier)
            db.prepare("DELETE FROM notification_deliveries WHERE status IN ('sent', 'failed', 'skipped') AND created_at < datetime('now', ?)").run(modifier)
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