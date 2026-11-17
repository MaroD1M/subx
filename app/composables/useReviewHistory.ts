import { computed, nextTick, ref, watch, type Ref } from 'vue'

export interface ReviewHistoryOptions {
  limit?: number
  debounceMs?: number
  clone?: <T>(value: T) => T
}

function defaultClone<T>(value: T): T {
  if (typeof structuredClone === 'function') {
    try { return structuredClone(value) } catch { /* fall through */ }
  }
  return JSON.parse(JSON.stringify(value)) as T
}

export function useReviewHistory<T>(entries: Ref<T[]>, options: ReviewHistoryOptions = {}) {
  const limit = Math.max(5, Math.min(100, Number(options.limit) || 30))
  const debounceMs = Math.max(50, Number(options.debounceMs) || 350)
  const clone = options.clone || defaultClone
  const history = ref<T[][]>([]) as Ref<T[][]>
  const index = ref(-1)
  const applying = ref(false)
  let timer: ReturnType<typeof setTimeout> | null = null

  function signature(value: T[]) {
    try { return JSON.stringify(value) } catch { return '' }
  }

  function recordNow() {
    if (applying.value) return
    const snapshot = clone(entries.value)
    const current = history.value[index.value]
    if (current && signature(current) === signature(snapshot)) return
    if (index.value < history.value.length - 1) history.value = history.value.slice(0, index.value + 1)
    history.value.push(snapshot)
    if (history.value.length > limit) history.value = history.value.slice(history.value.length - limit)
    index.value = history.value.length - 1
  }

  function reset() {
    if (timer) clearTimeout(timer)
    timer = null
    applying.value = false
    history.value = [clone(entries.value)]
    index.value = 0
  }

  function undo() {
    if (index.value <= 0) return false
    if (timer) { clearTimeout(timer); timer = null }
    applying.value = true
    index.value -= 1
    entries.value = clone(history.value[index.value] || [])
    void nextTick(() => { applying.value = false })
    return true
  }

  function redo() {
    if (index.value >= history.value.length - 1) return false
    if (timer) { clearTimeout(timer); timer = null }
    applying.value = true
    index.value += 1
    entries.value = clone(history.value[index.value] || [])
    void nextTick(() => { applying.value = false })
    return true
  }

  watch(entries, () => {
    if (applying.value) return
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => { timer = null; recordNow() }, debounceMs)
  }, { deep: true })

  return {
    canUndo: computed(() => index.value > 0),
    canRedo: computed(() => index.value < history.value.length - 1),
    undo,
    redo,
    reset,
    recordNow
  }
}
