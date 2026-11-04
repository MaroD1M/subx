export interface HistoryLike {
  replaceState: (data: any, unused: string, url?: string | URL | null) => void
}

export interface DocumentLike {
  visibilityState: string
}

const PATCH_REGISTRY = Symbol.for('subx.routerHistoryGuard')
const registry = ((globalThis as Record<PropertyKey, any>)[PATCH_REGISTRY] ??= new WeakSet<object>()) as WeakSet<object>

export function shouldSkipHiddenScrollReplaceState(options: {
  visibilityState: string
  state: unknown
  url?: string | URL | null
}) {
  const hasScrollState = Boolean(
    options.state
    && typeof options.state === 'object'
    && 'scroll' in (options.state as Record<string, unknown>)
  )
  return options.visibilityState === 'hidden'
    && hasScrollState
    && (options.url == null || options.url === '')
}

export function installRouterHistoryGuard(
  history: HistoryLike,
  documentLike: DocumentLike,
  userAgent: string
) {
  if (!/Edg\//.test(String(userAgent || ''))) return false
  if (registry.has(history)) return false

  const original = history.replaceState.bind(history)
  history.replaceState = function (state: any, unused: string, url?: string | URL | null) {
    if (shouldSkipHiddenScrollReplaceState({
      visibilityState: documentLike.visibilityState,
      state,
      url
    })) {
      return
    }
    return original(state, unused, url)
  }
  registry.add(history)
  return true
}
