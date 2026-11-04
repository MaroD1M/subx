import { installRouterHistoryGuard } from '~/utils/historyGuard'

export default defineNuxtPlugin(() => {
  if (!import.meta.client) return
  installRouterHistoryGuard(window.history, document, navigator.userAgent)
})
