import type { AppConfig } from '../../../types'

type OcrConfig = Pick<AppConfig, 'ocrLanguage' | 'ocrEngine'>

export function mergeOcrHealth(config: OcrConfig, health: unknown) {
  if (!health || typeof health !== 'object' || Array.isArray(health)) return health
  const reported = health as Record<string, any>
  return {
    ...reported,
    serviceLanguage: reported.language,
    language: String(config.ocrLanguage || reported.language || ''),
    serviceEngine: reported.engine,
    engine: config.ocrEngine && config.ocrEngine !== 'auto' ? config.ocrEngine : reported.engine
  }
}
