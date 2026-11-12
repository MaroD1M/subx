export const CROSS_PAGE_SETTINGS_KEYS: ReadonlySet<string> = new Set([
  'mediaRoots',
  'automationConcurrency',
  'notificationEnabled',
  'notificationLowConfidenceThreshold',
  'integrationWebhookToken',
  'integrationPathFrom',
  'integrationPathTo'
])

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue)
  if (value && typeof value === 'object') {
    const source = value as Record<string, unknown>
    const sorted: Record<string, unknown> = {}
    for (const key of Object.keys(source).sort()) {
      const nested = sortValue(source[key])
      if (nested !== undefined) sorted[key] = nested
    }
    return sorted
  }
  return value
}

export function stableStringify(value: unknown): string {
  return JSON.stringify(sortValue(value)) ?? 'null'
}

export function buildSettingsSnapshot(config: Record<string, unknown> | null | undefined): string {
  const snapshot: Record<string, unknown> = {}
  if (config && typeof config === 'object') {
    for (const key of Object.keys(config)) {
      if (CROSS_PAGE_SETTINGS_KEYS.has(key)) continue
      const value = sortValue(config[key])
      if (value !== undefined) snapshot[key] = value
    }
  }
  return stableStringify(snapshot)
}
