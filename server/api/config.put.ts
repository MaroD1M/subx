import { ConfigService } from '../utils/config'
import { useDb } from '../utils/db'
import { validateMediaRoots } from '../utils/mediaRoots'
import { clearEmbeddedSubtitleCache, clearLibraryCoverageCache } from '../utils/libraryCoverage'
import { configUpdateSchema, parseBody } from '../utils/validation'
import { STYLE_PRESETS } from '~~/shared/stylePresets'
import { normalizeSubtitleStyle } from '~~/shared/subtitleStyles'

const ALLOWED_KEYS = new Set([
  'apiKey',
  'apiBaseUrl',
  'providerType',
  'defaultModel',
  'fallbackProviderEnabled',
  'fallbackProviderType',
  'fallbackApiBaseUrl',
  'fallbackApiKey',
  'fallbackModel',
  'targetLanguage',
  'outputMode',
  'stylePreset',
  'subtitleFormat',
  'subtitleStylePreset',
  'subtitleStyle',
  'bilingualLayout',
  'embyCompatibleOutput',
  'qualityCheckEnabled',
  'qualityCheckModel',
  'qualityScoreThreshold',
  'qualityCheckMaxEntries',
  'integrationWebhookToken',
  'integrationPathFrom',
  'integrationPathTo',
  'chunkSize',
  'concurrency',
  'maxRetries',
  'translationMode',
  'glossary',
  'streamUsage',
  'logRetentionDays',
  'autoBackupEnabled',
  'autoBackupIntervalHours',
  'autoBackupKeep',
  'mediaRoots',
  'customStylePresets',
  'asrEnabled',
  'asrBaseUrl',
  'asrApiKey',
  'asrModel',
  'asrLanguage',
  'asrDevice',
  'asrComputeType',
  'asrUploadTimeoutMs',
  'asrPollTimeoutMs',
  'asrJobIdleTimeoutMs',
  'asrJobAbsoluteTimeoutMs',
  'asrChunkSeconds',
  'asrChunkOverlapSeconds',
  'asrResumeTtlHours',
  'asrVad',
  'asrWordTimestamps',
  'asrKeepAudio',
  'asrEngine',
  'asrPreprocess',
  'asrDiarization',
  'asrCloudEnabled',
  'asrCloudBaseUrl',
  'asrCloudApiKey',
  'asrCloudModel',
  'asrCloudFallback',
  'ocrEnabled',
  'ocrBaseUrl',
  'ocrLanguage',
  'ocrApiKey',
  'ocrEngine',
  'ocrMinConfidence',
  'ocrMaxSeconds',
  'ocrChunkSeconds',
  'ocrPgsripTimeoutSeconds',
  'ocrFfmpegTimeoutSeconds',
  'ocrChunkRetries',
  'ocrResumeTtlHours',
  'ocrJobIdleTimeoutMs',
  'ocrJobAbsoluteTimeoutMs',
  'automationConcurrency',
  'notificationEnabled',
  'notificationLowConfidenceThreshold',
  'chineseVariantOutputEnabled',
  'subtitleQualityEnabled',
  'subtitleQualityMaxCharsPerLine',
  'subtitleQualityMaxLines',
  'subtitleQualityMaxCps',
  'subtitleQualityMinDurationMs',
  'subtitleQualityMaxDurationMs',
  'subtitleQualityGapMs',
  'subtitleQualityAutoFixEnabled',
  'translationMemoryEnabled',
  'metadataEnabled',
  'metadataProvider',
  'metadataApiKey',
  'metadataLanguage',
  'costBudgetEnabled',
  'costBudgetMonthlyUsd',
  'costPricePromptPer1M',
  'costPriceCompletionPer1M'
])

function lowerBoundedNumber(value: unknown, fallback: number, minimum: number, integer = false) {
  const parsed = value === null || value === undefined || value === '' ? Number.NaN : Number(value)
  const numeric = Number.isFinite(parsed) ? parsed : fallback
  const bounded = Math.max(minimum, numeric)
  return integer ? Math.floor(bounded) : bounded
}

export default defineEventHandler(async (event) => {
  const body = await parseBody(event, configUpdateSchema)

  for (const [key, value] of Object.entries(body)) {
    if (!ALLOWED_KEYS.has(key)) continue
    if ((key === 'apiKey' || key === 'asrApiKey' || key === 'asrCloudApiKey' || key === 'fallbackApiKey' || key === 'ocrApiKey' || key === 'integrationWebhookToken' || key === 'metadataApiKey') && String(value).includes('*')) continue
    if (key === 'integrationWebhookToken' && !String(value).trim()) continue
    if (key === 'targetLanguage' && !/^[A-Za-z0-9][A-Za-z0-9_-]{0,34}$/.test(String(value || '').trim())) {
      throw apiError(400, '目标语言格式不合法')
    }
    if (key === 'subtitleFormat' && !['srt', 'ass', 'both'].includes(String(value))) {
      throw apiError(400, '字幕格式不合法')
    }
    if (key === 'subtitleStylePreset' && !body.subtitleStyle) {
      const current = await ConfigService.getConfig()
      const style = normalizeSubtitleStyle(value, String(body.outputMode || current.outputMode || 'bilingual'))
      await ConfigService.updateConfig('subtitleStyle', style)
      await ConfigService.updateConfig(key, style.presetId)
      continue
    }
    if (key === 'subtitleStyle') {
      const current = await ConfigService.getConfig()
      await ConfigService.updateConfig(key, normalizeSubtitleStyle(value, String(body.outputMode || current.outputMode || 'bilingual')))
      continue
    }
    if (key === 'mediaRoots') {
      const previousConfig = await ConfigService.getConfig()
      const previousRoots = new Map((previousConfig.mediaRoots || []).map(root => [String(root.id), root]))
      const roots = validateMediaRoots(value)
      await ConfigService.updateConfig(key, roots)
      try {
        const rootMap = new Map(roots.map(root => [root.id, root]))
        const changedRootIds = new Set<string>()
        for (const root of roots) {
          const previous = previousRoots.get(String(root.id))
          if (!previous || previous.path !== root.path || previous.name !== root.name) {
            changedRootIds.add(String(root.id))
          }
        }
        const db = useDb()
        const watchFolders = db.prepare('SELECT id, root_id FROM watch_folders').all() as any[]
        for (const folder of watchFolders) {
          const root = rootMap.get(String(folder.root_id))
          if (!root) {
            db.prepare('DELETE FROM watch_events WHERE folder_id = ?').run(folder.id)
            db.prepare('DELETE FROM watch_folders WHERE id = ?').run(folder.id)
          }
        }
        const rootIds = new Set(roots.map(root => String(root.id)))
        const removedRootIds = new Set<string>()
        for (const folder of watchFolders) {
          const rootId = String(folder.root_id)
          if (!rootIds.has(rootId)) removedRootIds.add(rootId)
        }
        try {
          const indexedRoots = db.prepare('SELECT DISTINCT root_id FROM library_coverage_index').all() as Array<{ root_id?: string }>
          for (const row of indexedRoots) {
            const rootId = String(row.root_id || '')
            if (rootId && !rootIds.has(rootId)) removedRootIds.add(rootId)
          }
        } catch { /* older schema */ }
        try {
          const snapshotRoots = db.prepare('SELECT DISTINCT root_id FROM coverage_snapshots').all() as Array<{ root_id?: string }>
          for (const row of snapshotRoots) {
            const rootId = String(row.root_id || '')
            if (rootId && !rootIds.has(rootId)) removedRootIds.add(rootId)
          }
        } catch { /* older schema */ }
        for (const rootId of removedRootIds) {
          try { db.prepare('DELETE FROM library_coverage_index WHERE root_id = ?').run(rootId) } catch { /* older schema */ }
          try { db.prepare('DELETE FROM coverage_auto_fill_policies WHERE root_id = ?').run(rootId) } catch { /* older schema */ }
          try { db.prepare('DELETE FROM coverage_snapshots WHERE root_id = ?').run(rootId) } catch { /* older schema */ }
        }
        for (const rootId of changedRootIds) {
          try { db.prepare('DELETE FROM library_coverage_index WHERE root_id = ?').run(rootId) } catch { /* older schema */ }
          try { db.prepare('DELETE FROM coverage_snapshots WHERE root_id = ?').run(rootId) } catch { /* older schema */ }
        }
        clearLibraryCoverageCache()
        clearEmbeddedSubtitleCache()
        const profileRoots = db.prepare('SELECT DISTINCT root_id FROM series_profiles WHERE root_id IS NOT NULL').all() as Array<{ root_id?: string }>
        for (const row of profileRoots) {
          const rootId = String(row.root_id || '')
          if (rootId && !rootIds.has(rootId)) {
            db.prepare('DELETE FROM series_profiles WHERE root_id = ?').run(rootId)
          }
        }
      } catch (error) {
        console.error('[Config] Failed to clean removed media root watch folders:', error)
      }
      continue
    }
    if (key === 'customStylePresets') {
      const builtinIds = new Set(STYLE_PRESETS.map(preset => preset.id))
      const sanitized = (Array.isArray(value) ? value : [])
        .map((preset: any, index: number) => {
          const rawId = String(preset?.id || `custom-${index + 1}`).trim()
          const id = builtinIds.has(rawId) ? `custom-${rawId}` : rawId
          return {
            id,
            name: String(preset?.name || '').trim(),
            icon: String(preset?.icon || 'i-lucide-wand-sparkles').trim(),
            description: String(preset?.description || '').trim(),
            prompt: String(preset?.prompt || '').trim()
          }
        })
        .filter(preset => preset.id && preset.name && preset.prompt)
      await ConfigService.updateConfig(key, sanitized)
      continue
    }
    if (['subtitleQualityMaxCharsPerLine', 'subtitleQualityMaxLines', 'subtitleQualityMaxCps', 'subtitleQualityMinDurationMs', 'subtitleQualityMaxDurationMs', 'subtitleQualityGapMs', 'costBudgetMonthlyUsd', 'costPricePromptPer1M', 'costPriceCompletionPer1M'].includes(key)) {
      const numeric = Number(value)
      const limits: Record<string, [number, number]> = {
        subtitleQualityMaxCharsPerLine: [8, 80],
        subtitleQualityMaxLines: [1, 6],
        subtitleQualityMaxCps: [5, 60],
        subtitleQualityMinDurationMs: [100, 10000],
        subtitleQualityMaxDurationMs: [1000, 60000],
        subtitleQualityGapMs: [0, 2000],
        costBudgetMonthlyUsd: [0, 1000000],
        costPricePromptPer1M: [0, 1000000],
        costPriceCompletionPer1M: [0, 1000000]
      }
      const [min, max] = limits[key]!
      await ConfigService.updateConfig(key, Math.max(min, Math.min(max, Number.isFinite(numeric) ? numeric : min)))
      continue
    }
    if (key === 'metadataProvider') {
      await ConfigService.updateConfig(key, 'tmdb')
      continue
    }
    if (key === 'metadataLanguage' && !/^[A-Za-z0-9][A-Za-z0-9_-]{0,20}$/.test(String(value || '').trim())) {
      throw apiError(400, '元数据语言格式不合法')
    }
    if (key === 'chunkSize') {
      await ConfigService.updateConfig(key, Math.min(50000, Math.max(100, Number(value) || 5000)))
      continue
    }
    if (key === 'logRetentionDays') {
      await ConfigService.updateConfig(key, Math.max(1, Math.min(365, Number(value) || 7)))
      continue
    }
    if (key === 'automationConcurrency') {
      await ConfigService.updateConfig(key, Math.max(1, Math.min(10, Number(value) || 1)))
      continue
    }
    if (key === 'notificationLowConfidenceThreshold') {
      await ConfigService.updateConfig(key, Math.min(1, Math.max(0, Number(value) || 0.6)))
      continue
    }
    if (key === 'qualityScoreThreshold') {
      await ConfigService.updateConfig(key, Math.min(1, Math.max(0, Number(value) || 0.7)))
      continue
    }
    if (key === 'qualityCheckMaxEntries') {
      await ConfigService.updateConfig(key, Math.max(1, Math.min(1000, Number(value) || 200)))
      continue
    }
    if (key === 'ocrMinConfidence') {
      const parsed = Number(value)
      await ConfigService.updateConfig(key, Math.max(0, Math.min(100, Number.isFinite(parsed) ? parsed : 25)))
      continue
    }
    if (key === 'ocrEngine') {
      await ConfigService.updateConfig(key, ['auto', 'rapidocr', 'tesseract'].includes(String(value)) ? String(value) : 'auto')
      continue
    }
    if (key === 'ocrMaxSeconds') {
      await ConfigService.updateConfig(key, lowerBoundedNumber(value, 14400, 300))
      continue
    }
    if (key === 'ocrChunkSeconds') {
      await ConfigService.updateConfig(key, lowerBoundedNumber(value, 1800, 300))
      continue
    }
    if (key === 'ocrPgsripTimeoutSeconds') {
      await ConfigService.updateConfig(key, lowerBoundedNumber(value, 7200, 300))
      continue
    }
    if (key === 'ocrFfmpegTimeoutSeconds') {
      await ConfigService.updateConfig(key, lowerBoundedNumber(value, 3600, 60))
      continue
    }
    if (key === 'ocrChunkRetries') {
      await ConfigService.updateConfig(key, Math.max(0, Math.min(5, Math.floor(Number(value) || 0))))
      continue
    }
    if (key === 'ocrResumeTtlHours') {
      await ConfigService.updateConfig(key, lowerBoundedNumber(value, 24, 1, true))
      continue
    }
    if (key === 'ocrJobIdleTimeoutMs') {
      await ConfigService.updateConfig(key, lowerBoundedNumber(value, 60 * 60 * 1000, 60_000))
      continue
    }
    if (key === 'ocrJobAbsoluteTimeoutMs') {
      await ConfigService.updateConfig(key, lowerBoundedNumber(value, 6 * 60 * 60 * 1000, 10 * 60 * 1000))
      continue
    }
    if (key === 'asrUploadTimeoutMs') {
      await ConfigService.updateConfig(key, lowerBoundedNumber(value, 30 * 60 * 1000, 60_000))
      continue
    }
    if (key === 'asrPollTimeoutMs') {
      await ConfigService.updateConfig(key, lowerBoundedNumber(value, 30_000, 1_000))
      continue
    }
    if (key === 'asrJobIdleTimeoutMs') {
      await ConfigService.updateConfig(key, lowerBoundedNumber(value, 30 * 60 * 1000, 60_000))
      continue
    }
    if (key === 'asrJobAbsoluteTimeoutMs') {
      await ConfigService.updateConfig(key, lowerBoundedNumber(value, 6 * 60 * 60 * 1000, 10 * 60 * 1000))
      continue
    }
    if (key === 'asrChunkSeconds') {
      await ConfigService.updateConfig(key, lowerBoundedNumber(value, 300, 60, true))
      continue
    }
    if (key === 'asrChunkOverlapSeconds') {
      await ConfigService.updateConfig(key, Math.max(0, Math.min(30, Math.floor(Number(value) || 2))))
      continue
    }
    if (key === 'asrResumeTtlHours') {
      await ConfigService.updateConfig(key, lowerBoundedNumber(value, 168, 1, true))
      continue
    }
    await ConfigService.updateConfig(key, value)
  }

  return { success: true }
})
