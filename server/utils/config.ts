import { join } from 'path'
import { existsSync } from 'fs'
import { useDb } from './db'
import type { AppConfig, MediaRoot } from '../../types'

let lastLogCleanupAt = 0
let configCache: AppConfig | null = null
let configCacheAt = 0
const CONFIG_CACHE_TTL_MS = 5000

export const ConfigService = {
    /**
     * Get all configuration
     */
    async getConfig(forceFresh = false): Promise<AppConfig> {
        const now = Date.now()
        if (!forceFresh && configCache && now - configCacheAt < CONFIG_CACHE_TTL_MS) {
            return { ...configCache, glossary: { ...configCache.glossary }, mediaRoots: Array.isArray(configCache.mediaRoots) ? [...configCache.mediaRoots] : [] }
        }

        const db = useDb()
        const rows = db.prepare('SELECT key, value FROM config').all() as any[]

        // Default values
        const config: AppConfig = {
            apiKey: '',
            apiBaseUrl: 'https://api.openai.com/v1',
            defaultModel: 'gpt-3.5-turbo',
            targetLanguage: 'zh-CN',
            chunkSize: 2000,
            concurrency: 3,
            maxRetries: 3,
            translationMode: 'non_stream',
            streamUsage: false,
            logRetentionDays: 7,
            glossary: {},
            mediaRoots: []
        }

        // Override with DB values
        rows.forEach(row => {
            if (row.key === 'glossary') {
                config.glossary = JSON.parse(row.value)
            } else if (row.key === 'mediaRoots') {
                config.mediaRoots = JSON.parse(row.value) as MediaRoot[]
            } else if (['chunkSize', 'concurrency', 'maxRetries', 'logRetentionDays'].includes(row.key)) {
                (config as any)[row.key] = Number(row.value)
            } else if (row.key === 'streamUsage') {
                config.streamUsage = row.value === 'true' || row.value === '1'
            } else if (row.key === 'translationMode') {
                config.translationMode = row.value === 'stream' ? 'stream' : 'non_stream'
            } else {
                (config as any)[row.key] = row.value
            }
        })

        configCache = {
            ...config,
            glossary: { ...config.glossary },
            mediaRoots: Array.isArray(config.mediaRoots) ? [...config.mediaRoots] : []
        }
        configCacheAt = now

        return { ...configCache, glossary: { ...configCache.glossary }, mediaRoots: Array.isArray(configCache.mediaRoots) ? [...configCache.mediaRoots] : [] }
    },

    /**
     * Update configuration
     */
    async updateConfig(key: string, value: any) {
        const db = useDb()
        const valStr = typeof value === 'object' ? JSON.stringify(value) : String(value)

        const stmt = db.prepare('INSERT OR REPLACE INTO config (key, value, updated_at) VALUES (?, ?, datetime(\'now\'))')
        stmt.run(key, valStr)
        configCache = null
        configCacheAt = 0
    },

    async cleanupLogsIfNeeded() {
        const now = Date.now()
        if (now - lastLogCleanupAt < 6 * 60 * 60 * 1000) return
        lastLogCleanupAt = now
        await this.cleanupLogs()
    },

    /**
     * Cleanup old logs from temp/ai-logs
     */
    async cleanupLogs() {
        const config = await this.getConfig()
        const days = config.logRetentionDays || 7
        const logDir = join(process.cwd(), 'temp', 'ai-logs')
        
        if (!existsSync(logDir)) return

        const now = Date.now()
        const maxAge = days * 24 * 60 * 60 * 1000

        const { readdirSync, statSync, rmSync } = await import('fs')
        const files = readdirSync(logDir)

        files.forEach(file => {
            const filePath = join(logDir, file)
            const stats = statSync(filePath)
            if (now - stats.mtimeMs > maxAge) {
                try {
                    rmSync(filePath)
                    console.log(`[Config] Cleaned up old log file: ${file}`)
                } catch (e) {
                    console.error(`[Config] Failed to cleanup log: ${file}`, e)
                }
            }
        })
    }
}
