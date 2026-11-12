import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

let workDir = ''
let ConfigService: typeof import('../config').ConfigService

beforeAll(async () => {
  workDir = mkdtempSync(join(tmpdir(), 'subx-config-'))
  process.env.DB_PATH = join(workDir, 'subx.db')
  process.env.SUBX_ALL_IN_ONE = 'true'
  process.env.ASR_INTERNAL_URL = 'http://127.0.0.1:8000'
  delete process.env.SUBX_KEEP_LEGACY_SIDECAR_URLS
  vi.resetModules()
  ConfigService = (await import('../config')).ConfigService
})

afterAll(() => {
  delete process.env.SUBX_ALL_IN_ONE
  delete process.env.ASR_INTERNAL_URL
  rmSync(workDir, { recursive: true, force: true })
})

describe('ConfigService local service migration', () => {
  it('migrates the legacy sidecar URL only once', async () => {
    await ConfigService.updateConfig('asrBaseUrl', 'http://subx-asr:8000')
    const migrated = await ConfigService.getConfig(true)
    expect(migrated.asrBaseUrl).toBe('http://127.0.0.1:8000')

    // 迁移后用户显式保存的 sidecar 地址必须保留，不能被再次改写。
    await ConfigService.updateConfig('asrBaseUrl', 'http://subx-asr:8000')
    const saved = await ConfigService.getConfig(true)
    expect(saved.asrBaseUrl).toBe('http://subx-asr:8000')
  })

  it('derives structured styles from legacy preset-only config', async () => {
    await ConfigService.updateConfig('outputMode', 'bilingual')
    await ConfigService.updateConfig('subtitleStylePreset', 'bilingual_simple')

    const legacy = await ConfigService.getConfig(true)
    expect(legacy.subtitleStylePreset).toBe('bilingual_simple')
    expect(legacy.subtitleStyle?.presetId).toBe('bilingual_simple')
    expect(legacy.subtitleStyle?.translated.fontSize).toBe(48)
    expect(legacy.subtitleStyle?.original.fontSize).toBe(28)
  })

  it('provides and persists structured subtitle styles', async () => {
    const defaults = await ConfigService.getConfig(true)
    expect(defaults.subtitleStyle?.presetId).toBeTruthy()
    expect(defaults.subtitleStyle?.translated.fontSize).toBeGreaterThan(0)

    await ConfigService.updateConfig('outputMode', 'bilingual')
    await ConfigService.updateConfig('subtitleStyle', {
      presetId: 'bilingual_study',
      original: { fontFamily: 'Source Han Sans SC', fontSize: 36, primaryColor: '#112233' },
      translated: { fontSize: 50, primaryColor: '#AABBCC' },
      lineGap: 8,
      background: { enabled: true, color: '#000000', opacity: 70, padding: 3 }
    })

    const saved = await ConfigService.getConfig(true)
    expect(saved.subtitleStyle?.presetId).toBe('bilingual_study')
    expect(saved.subtitleStyle?.original.fontFamily).toBe('Source Han Sans SC')
    expect(saved.subtitleStyle?.original.fontSize).toBe(36)
    expect(saved.subtitleStyle?.original.primaryColor).toBe('#112233')
    expect(saved.subtitleStyle?.translated.fontSize).toBe(50)
    expect(saved.subtitleStyle?.lineGap).toBe(8)
    expect(saved.subtitleStyle?.background).toMatchObject({ enabled: true, color: '#000000', opacity: 70, padding: 3 })
  })

  it('defaults TMDB auto search to off', async () => {
    const defaults = await ConfigService.getConfig(true)
    expect(defaults.metadataAutoSearchEnabled).toBe(false)
  })

  it('provides and persists OCR long-video settings', async () => {
    const defaults = await ConfigService.getConfig(true)
    expect(defaults.ocrMaxSeconds).toBe(14400)
    expect(defaults.ocrChunkSeconds).toBe(1800)
    expect(defaults.ocrJobIdleTimeoutMs).toBe(60 * 60 * 1000)
    expect(defaults.ocrJobAbsoluteTimeoutMs).toBe(6 * 60 * 60 * 1000)

    await ConfigService.updateConfig('ocrMaxSeconds', 21600)
    await ConfigService.updateConfig('ocrChunkSeconds', 3600)
    await ConfigService.updateConfig('ocrChunkRetries', 2)

    const saved = await ConfigService.getConfig(true)
    expect(saved.ocrMaxSeconds).toBe(21600)
    expect(saved.ocrChunkSeconds).toBe(3600)
    expect(saved.ocrChunkRetries).toBe(2)
  })
})

describe('ConfigService API key env fallback', () => {
  const originalAsrApiKey = process.env.ASR_API_KEY
  const originalOcrApiKey = process.env.OCR_API_KEY
  const originalAllInOne = process.env.SUBX_ALL_IN_ONE

  afterEach(() => {
    if (originalAsrApiKey === undefined) delete process.env.ASR_API_KEY
    else process.env.ASR_API_KEY = originalAsrApiKey
    if (originalOcrApiKey === undefined) delete process.env.OCR_API_KEY
    else process.env.OCR_API_KEY = originalOcrApiKey
    if (originalAllInOne === undefined) delete process.env.SUBX_ALL_IN_ONE
    else process.env.SUBX_ALL_IN_ONE = originalAllInOne
  })

  it('falls back to ASR_API_KEY when the saved key is empty', async () => {
    process.env.ASR_API_KEY = 'env-asr-key'
    await ConfigService.updateConfig('asrApiKey', '')

    const config = await ConfigService.getConfig(true)
    expect(config.asrApiKey).toBe('env-asr-key')
  })

  it('falls back to OCR_API_KEY when the saved key is empty', async () => {
    process.env.OCR_API_KEY = 'env-ocr-key'
    await ConfigService.updateConfig('ocrApiKey', '')

    const config = await ConfigService.getConfig(true)
    expect(config.ocrApiKey).toBe('env-ocr-key')
  })

  it('prefers ASR_API_KEY over a different saved key in all-in-one mode', async () => {
    process.env.SUBX_ALL_IN_ONE = 'true'
    process.env.ASR_API_KEY = 'env-asr-key'
    await ConfigService.updateConfig('asrApiKey', 'saved-asr-key')

    const config = await ConfigService.getConfig(true)
    expect(config.asrApiKey).toBe('env-asr-key')
  })

  it('encrypts and decrypts the fallback provider API key', async () => {
    await ConfigService.updateConfig('fallbackApiKey', 'fallback-secret-key')
    const saved = await ConfigService.getConfig(true)
    expect(saved.fallbackApiKey).toBe('fallback-secret-key')
    expect(saved.fallbackProviderType).toBe('openai-compatible')
    expect(saved.fallbackProviderEnabled).toBe(false)
  })

  it('keeps the saved ASR key over ASR_API_KEY in split mode', async () => {
    process.env.SUBX_ALL_IN_ONE = 'false'
    process.env.ASR_API_KEY = 'env-asr-key'
    await ConfigService.updateConfig('asrApiKey', 'saved-asr-key')

    const config = await ConfigService.getConfig(true)
    expect(config.asrApiKey).toBe('saved-asr-key')
  })
})
