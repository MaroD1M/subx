import { ref } from 'vue'

export interface SeriesProfile {
  seriesKey: string
  rootId?: string
  title: string
  background: string
  glossary: Record<string, string>
  summary: string
  lastTaskId?: string
  createdAt?: string
  updatedAt?: string
}

export interface SeriesProfileLoadResult {
  seriesKey: string
  inferredTitle: string
  profile: SeriesProfile | null
}

export interface SeriesProfileSavePayload {
  rootId?: string
  filePath: string
  title?: string
  background?: string
  glossary?: Record<string, string>
  summary?: string
}

function isAbortError(error: any) {
  return error?.name === 'AbortError' || error?.cause?.name === 'AbortError'
}

export function useSeriesProfile() {
  const profile = ref<SeriesProfile | null>(null)
  const seriesKey = ref('')
  const inferredTitle = ref('')
  const loading = ref(false)

  let controller: AbortController | null = null
  let requestId = 0
  let mutationVersion = 0

  function abort() {
    const current = controller
    controller = null
    if (current && !current.signal.aborted) current.abort()
  }

  function reset() {
    abort()
    requestId += 1
    loading.value = false
    profile.value = null
    seriesKey.value = ''
    inferredTitle.value = ''
  }

  async function load(rootId: string | undefined, filePath: string): Promise<SeriesProfileLoadResult | null> {
    abort()
    const currentRequest = ++requestId
    const currentMutation = mutationVersion
    const currentController = new AbortController()
    controller = currentController
    loading.value = true
    profile.value = null
    seriesKey.value = ''
    inferredTitle.value = ''

    try {
      const res = await ($fetch as any)('/api/series/profile', {
        query: { rootId, filePath },
        signal: currentController.signal
      })
      if (currentController.signal.aborted || currentRequest !== requestId || currentMutation !== mutationVersion) return null
      const result: SeriesProfileLoadResult = {
        seriesKey: String(res?.seriesKey || ''),
        inferredTitle: String(res?.inferredTitle || ''),
        profile: res?.profile || null
      }
      seriesKey.value = result.seriesKey
      inferredTitle.value = result.inferredTitle
      profile.value = result.profile
      return result
    } catch (error) {
      if (currentController.signal.aborted || isAbortError(error) || currentRequest !== requestId || currentMutation !== mutationVersion) return null
      profile.value = null
      return { seriesKey: '', inferredTitle: '', profile: null }
    } finally {
      if (controller === currentController) controller = null
      if (currentRequest === requestId) loading.value = false
    }
  }

  async function save(payload: SeriesProfileSavePayload): Promise<SeriesProfile | null> {
    const res = await ($fetch as any)('/api/series/profile', { method: 'PUT', body: payload })
    const next: SeriesProfile | null = res?.profile || null
    if (next) {
      mutationVersion += 1
      profile.value = next
      seriesKey.value = String(next.seriesKey || seriesKey.value || '')
      if (next.title) inferredTitle.value = String(next.title)
    }
    return next
  }

  return { profile, seriesKey, inferredTitle, loading, load, save, reset, abort }
}
