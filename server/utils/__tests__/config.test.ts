import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
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
})
