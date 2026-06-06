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
  'failOnUntranslated',
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
    await ConfigService.updateConfig(key, value)
  }

  return { success: true }
})
