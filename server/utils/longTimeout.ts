export const MAX_SINGLE_TIMER_DELAY_MS = 2_147_483_647

export function scheduleLongTimeout(delayMs: number, callback: () => void): () => void {
  const delay = Number.isFinite(delayMs) ? Math.max(0, delayMs) : 0
  const deadline = Date.now() + delay
  let timer: ReturnType<typeof setTimeout> | null = null
  let cancelled = false

  const schedule = () => {
    if (cancelled) return
    const remaining = deadline - Date.now()
    if (remaining <= 0) {
      callback()
      return
    }
    timer = setTimeout(schedule, Math.min(remaining, MAX_SINGLE_TIMER_DELAY_MS))
  }

  schedule()

  return () => {
    cancelled = true
    if (timer) clearTimeout(timer)
  }
}

export function createLongTimeoutSignal(delayMs: number) {
  const controller = new AbortController()
  const cancel = scheduleLongTimeout(delayMs, () => controller.abort())
  return { signal: controller.signal, cancel }
}
