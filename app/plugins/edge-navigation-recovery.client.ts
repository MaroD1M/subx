import { nextTick } from 'vue'

const EDGE_UA_PATTERN = /Edg\//
const RELOAD_GUARD_KEY = 'subx:edge-navigation-recovery:last-reload'
const RELOAD_GUARD_MS = 20_000
const PAGE_START_TIMEOUT_MS = 3_000
const PAGE_FINISH_TIMEOUT_MS = 8_000

export default defineNuxtPlugin(() => {
  if (!EDGE_UA_PATTERN.test(navigator.userAgent)) return

  const nuxtApp = useNuxtApp()
  const router = useRouter()
  const runtimeConfig = useRuntimeConfig()

  let hiddenAt = 0
  let resumedAt = 0
  let pageStarted = false
  let pageFinished = false
  let watchdogTimer: ReturnType<typeof setTimeout> | null = null
  let finishTimer: ReturnType<typeof setTimeout> | null = null
  let watchdogEnabled = false

  function canReload() {
    try {
      const lastReload = Number(sessionStorage.getItem(RELOAD_GUARD_KEY) || 0)
      return !Number.isFinite(lastReload) || Date.now() - lastReload > RELOAD_GUARD_MS
    } catch {
      return true
    }
  }

  function reloadNow(reason: string) {
    if (!canReload()) return
    try {
      sessionStorage.setItem(RELOAD_GUARD_KEY, String(Date.now()))
    } catch {
      // ignore storage failures
    }
    console.warn(`[EdgeRecovery] Reloading page: ${reason}`)
    window.location.reload()
  }

  function locationFullPath() {
    const baseURL = String(runtimeConfig.app.baseURL || '/')
    const normalizedBase = baseURL.endsWith('/') && baseURL !== '/' ? baseURL.slice(0, -1) : baseURL
    let pathname = window.location.pathname
    if (normalizedBase && normalizedBase !== '/' && pathname.startsWith(normalizedBase)) {
      pathname = pathname.slice(normalizedBase.length) || '/'
    }
    return `${pathname}${window.location.search}${window.location.hash}`
  }

  function routeMatchesLocation() {
    return router.currentRoute.value.fullPath === locationFullPath()
  }

  function clearWatchdog() {
    if (watchdogTimer) {
      clearTimeout(watchdogTimer)
      watchdogTimer = null
    }
  }

  function clearFinishTimer() {
    if (finishTimer) {
      clearTimeout(finishTimer)
      finishTimer = null
    }
  }

  function armFinishTimer() {
    if (!watchdogEnabled || pageFinished) return
    clearFinishTimer()
    finishTimer = setTimeout(() => {
      finishTimer = null
      if (pageFinished) return
      // 只处理 Edge 恢复后的异常卡死，避免把正常的慢页面误判为卡死。
      if (!resumedAt || Date.now() - resumedAt > 5 * 60 * 1000) return
      reloadNow('page did not finish after Edge resumed')
    }, PAGE_FINISH_TIMEOUT_MS)
  }

  function armWatchdog(reason: string) {
    if (!watchdogEnabled || pageStarted) return
    clearWatchdog()
    watchdogTimer = setTimeout(() => {
      watchdogTimer = null
      if (!pageStarted) {
        reloadNow(reason)
        return
      }
      if (!routeMatchesLocation()) {
        reloadNow('route and location diverged after navigation')
      }
    }, PAGE_START_TIMEOUT_MS)
  }

  nuxtApp.hook('app:mounted', () => {
    watchdogEnabled = true
  })

  nuxtApp.hook('page:start', () => {
    pageStarted = true
    clearWatchdog()
    armFinishTimer()
  })

  nuxtApp.hook('page:finish', () => {
    pageFinished = true
    clearFinishTimer()
  })

  router.beforeEach(() => {
    pageStarted = false
    pageFinished = false
    clearWatchdog()
    clearFinishTimer()
  })

  router.afterEach((to, from, failure) => {
    if (failure || to.path === from.path) return
    armWatchdog('new page did not start after navigation')
  })

  router.onError((error) => {
    const message = String((error as any)?.message || error || '')
    if (/dynamically imported module|module script failed|Loading chunk|preload/i.test(message)) {
      reloadNow(`chunk load failed: ${message}`)
    }
  })

  nuxtApp.hook('app:chunkError', ({ error }: { error?: unknown }) => {
    const message = String((error as any)?.message || error || 'unknown chunk error')
    if (/dynamically imported module|module script failed|Loading chunk|preload|css/i.test(message)) {
      reloadNow(`chunk error: ${message}`)
    }
  })

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      hiddenAt = Date.now()
      return
    }

    const hiddenFor = hiddenAt ? Date.now() - hiddenAt : 0
    hiddenAt = 0
    if (hiddenFor < 5_000) return
    resumedAt = Date.now()

    nextTick(() => {
      if (!routeMatchesLocation()) {
        reloadNow('route and location diverged after tab restore')
      }
    })
  })

  window.addEventListener('pageshow', (event) => {
    if (!event.persisted) return
    resumedAt = Date.now()
    nextTick(() => {
      if (!routeMatchesLocation()) {
        reloadNow('route and location diverged after bfcache restore')
      }
    })
  })
})
