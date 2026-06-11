import { ConfigService } from '../utils/config'
import { validateMediaRoots } from '../utils/mediaRoots'

const ALLOWED_KEYS = new Set([
  'apiKey',
  'apiBaseUrl',
  'defaultModel',
  'targetLanguage',
  'outputMode',
  'stylePreset',
  'subtitleFormat',
  'subtitleStylePreset',
  'bilingualLayout',
  'chunkSize',
  'concurrency',
  'maxRetries',
  'translationMode',
  'glossary',
  'streamUsage',
  'logRetentionDays',
  'mediaRoots'
])

export default defineEventHandler(async (event) => {
  const body = await readBody(event)

  for (const [key, value] of Object.entries(body)) {
    if (!ALLOWED_KEYS.has(key)) continue
    if (key === 'apiKey' && String(value).includes('*')) continue
    if (key === 'mediaRoots') {
      await ConfigService.updateConfig(key, validateMediaRoots(value))
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
    await ConfigService.updateConfig(key, value)
  }

  return { success: true }
})
