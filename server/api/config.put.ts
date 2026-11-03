import { ConfigService } from '../utils/config'
import { validateMediaRoots } from '../utils/mediaRoots'
import { configUpdateSchema, parseBody } from '../utils/validation'
import { STYLE_PRESETS } from '~~/shared/stylePresets'

const ALLOWED_KEYS = new Set([
  'apiKey',
  'apiBaseUrl',
  'providerType',
  'defaultModel',
  'targetLanguage',
  'outputMode',
  'stylePreset',
  'subtitleFormat',
  'subtitleStylePreset',
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
  'notificationLowConfidenceThreshold'
])

export default defineEventHandler(async (event) => {
  const body = await parseBody(event, configUpdateSchema)

  for (const [key, value] of Object.entries(body)) {
    if (!ALLOWED_KEYS.has(key)) continue
    if ((key === 'apiKey' || key === 'asrApiKey' || key === 'asrCloudApiKey' || key === 'ocrApiKey' || key === 'integrationWebhookToken') && String(value).includes('*')) continue
    if (key === 'mediaRoots') {
      await ConfigService.updateConfig(key, validateMediaRoots(value))
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
      await ConfigService.updateConfig(key, Math.max(300, Math.min(24 * 60 * 60, Number(value) || 14400)))
      continue
    }
    if (key === 'ocrChunkSeconds') {
      await ConfigService.updateConfig(key, Math.max(300, Math.min(4 * 60 * 60, Number(value) || 1800)))
      continue
    }
    if (key === 'ocrPgsripTimeoutSeconds') {
      await ConfigService.updateConfig(key, Math.max(300, Math.min(24 * 60 * 60, Number(value) || 7200)))
      continue
    }
    if (key === 'ocrFfmpegTimeoutSeconds') {
      await ConfigService.updateConfig(key, Math.max(60, Math.min(24 * 60 * 60, Number(value) || 3600)))
      continue
    }
    if (key === 'ocrChunkRetries') {
      await ConfigService.updateConfig(key, Math.max(0, Math.min(5, Math.floor(Number(value) || 0))))
      continue
    }
    if (key === 'ocrResumeTtlHours') {
      await ConfigService.updateConfig(key, Math.max(1, Math.min(168, Math.floor(Number(value) || 24))))
      continue
    }
    if (key === 'ocrJobIdleTimeoutMs') {
      await ConfigService.updateConfig(key, Math.max(60_000, Math.min(24 * 60 * 60 * 1000, Number(value) || 60 * 60 * 1000)))
      continue
    }
    if (key === 'ocrJobAbsoluteTimeoutMs') {
      await ConfigService.updateConfig(key, Math.max(10 * 60 * 1000, Math.min(7 * 24 * 60 * 60 * 1000, Number(value) || 6 * 60 * 60 * 1000)))
      continue
    }
    if (key === 'asrUploadTimeoutMs') {
      await ConfigService.updateConfig(key, Math.max(60_000, Math.min(24 * 60 * 60 * 1000, Number(value) || 30 * 60 * 1000)))
      continue
    }
    if (key === 'asrPollTimeoutMs') {
      await ConfigService.updateConfig(key, Math.max(1_000, Math.min(60_000, Number(value) || 30_000)))
      continue
    }
    if (key === 'asrJobIdleTimeoutMs') {
      await ConfigService.updateConfig(key, Math.max(60_000, Math.min(24 * 60 * 60 * 1000, Number(value) || 30 * 60 * 1000)))
      continue
    }
    if (key === 'asrJobAbsoluteTimeoutMs') {
      await ConfigService.updateConfig(key, Math.max(10 * 60 * 1000, Math.min(7 * 24 * 60 * 60 * 1000, Number(value) || 6 * 60 * 60 * 1000)))
      continue
    }
    await ConfigService.updateConfig(key, value)
  }

  return { success: true }
})
