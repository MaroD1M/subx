import { describe, expect, it } from 'vitest'
import { buildSettingsSnapshot, CROSS_PAGE_SETTINGS_KEYS } from '../../shared/settingsSnapshot'

function createConfig(): Record<string, any> {
  return {
    apiKey: 'sk-test',
    chineseVariantOutputEnabled: false,
    subtitleQualityEnabled: false,
    subtitleQualityMaxCharsPerLine: 20,
    subtitleQualityMaxLines: 2,
    subtitleQualityMaxCps: 20,
    subtitleQualityMinDurationMs: 1000,
    subtitleQualityMaxDurationMs: 8000,
    subtitleQualityGapMs: 100,
    subtitleQualityAutoFixEnabled: false,
    translationMemoryEnabled: false,
    costBudgetEnabled: false,
    costBudgetMonthlyUsd: 10,
    costPricePromptPer1M: 1,
    costPriceCompletionPer1M: 2,
    metadataEnabled: false,
    metadataApiKey: 'key-a',
    metadataLanguage: 'zh-CN',
    glossary: { Alpha: '阿尔法', Beta: '贝塔' },
    customStylePresets: [{ id: 'custom-1', name: '风格一', description: '描述', prompt: '提示' }],
    mediaRoots: [{ id: 'root-1', path: '/media' }],
    automationConcurrency: 1,
    notificationEnabled: false,
    notificationLowConfidenceThreshold: 0.5,
    integrationWebhookToken: 'token-a',
    integrationPathFrom: '/from',
    integrationPathTo: '/to'
  }
}

const FIELD_CASES: Array<[string, unknown, unknown]> = [
  ['chineseVariantOutputEnabled', false, true],
  ['subtitleQualityEnabled', false, true],
  ['subtitleQualityMaxCharsPerLine', 20, 24],
  ['subtitleQualityMaxLines', 2, 3],
  ['subtitleQualityMaxCps', 20, 22],
  ['subtitleQualityMinDurationMs', 1000, 1200],
  ['subtitleQualityMaxDurationMs', 8000, 9000],
  ['subtitleQualityGapMs', 100, 200],
  ['subtitleQualityAutoFixEnabled', false, true],
  ['translationMemoryEnabled', false, true],
  ['costBudgetEnabled', false, true],
  ['costBudgetMonthlyUsd', 10, 20],
  ['costPricePromptPer1M', 1, 2],
  ['costPriceCompletionPer1M', 2, 3],
  ['metadataEnabled', false, true],
  ['metadataApiKey', 'key-a', 'key-b'],
  ['metadataLanguage', 'zh-CN', 'en']
]

describe('settings snapshot', () => {
  it.each(FIELD_CASES)('detects changes to %s', (field, initial, next) => {
    const before = buildSettingsSnapshot({ ...createConfig(), [field]: initial })
    const after = buildSettingsSnapshot({ ...createConfig(), [field]: next })
    expect(after).not.toBe(before)
  })

  it.each(Array.from(CROSS_PAGE_SETTINGS_KEYS))('ignores cross-page field %s', (key) => {
    const before = buildSettingsSnapshot({ ...createConfig(), [key]: 'before' })
    const after = buildSettingsSnapshot({ ...createConfig(), [key]: 'after' })
    expect(after).toBe(before)
  })

  it('ignores object key order at every level', () => {
    const first = buildSettingsSnapshot({
      apiKey: 'x',
      glossary: { zeta: 'z', alpha: 'a' },
      nested: { second: 2, first: 1 },
      list: [{ beta: 2, alpha: 1 }]
    })
    const second = buildSettingsSnapshot({
      list: [{ alpha: 1, beta: 2 }],
      nested: { first: 1, second: 2 },
      glossary: { alpha: 'a', zeta: 'z' },
      apiKey: 'x'
    })
    expect(second).toBe(first)
  })

  it('treats undefined and missing fields the same', () => {
    const withUndefined = buildSettingsSnapshot({
      apiKey: 'x',
      empty: undefined,
      nested: { value: 1, missing: undefined }
    })
    const withoutUndefined = buildSettingsSnapshot({
      apiKey: 'x',
      nested: { value: 1 }
    })
    expect(withUndefined).toBe(withoutUndefined)
  })

  it('includes configuration keys by default', () => {
    const before = buildSettingsSnapshot({ apiKey: 'x', futureSetting: { enabled: true, level: 1 } })
    const after = buildSettingsSnapshot({ apiKey: 'x', futureSetting: { enabled: true, level: 2 } })
    expect(after).not.toBe(before)
  })

  it('detects glossary changes', () => {
    const before = buildSettingsSnapshot(createConfig())
    const afterConfig = createConfig()
    afterConfig.glossary = { ...afterConfig.glossary, Alpha: '阿尔法改' }
    expect(buildSettingsSnapshot(afterConfig)).not.toBe(before)
  })

  it('detects nested custom style changes', () => {
    const before = buildSettingsSnapshot(createConfig())
    const afterConfig = createConfig()
    afterConfig.customStylePresets = [{ ...afterConfig.customStylePresets[0], prompt: '新的提示' }]
    expect(buildSettingsSnapshot(afterConfig)).not.toBe(before)
  })
})
