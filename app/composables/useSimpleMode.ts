import { onMounted, ref, watch } from 'vue'

const SIMPLE_MODE_STORAGE_KEY = 'subx:simple-mode'

function hasLocalStorage() {
  return typeof window !== 'undefined' && typeof localStorage !== 'undefined'
}

export const simpleMode = ref(false)

function readStoredSimpleMode() {
  if (!hasLocalStorage()) return false
  try {
    const stored = localStorage.getItem(SIMPLE_MODE_STORAGE_KEY)
    return stored === 'true' || stored === '1'
  } catch {
    return false
  }
}

function persistSimpleMode(value: boolean) {
  if (!hasLocalStorage()) return
  try {
    localStorage.setItem(SIMPLE_MODE_STORAGE_KEY, String(value))
  } catch {
    // Ignore storage failures (private mode, quota, etc.).
  }
}

export function setSimpleMode(value: boolean) {
  simpleMode.value = Boolean(value)
}

export function toggleSimpleMode() {
  simpleMode.value = !simpleMode.value
}

let initialized = false

export function useSimpleMode() {
  if (import.meta.client && !initialized) {
    initialized = true
    onMounted(() => {
      simpleMode.value = readStoredSimpleMode()
    })
    watch(simpleMode, persistSimpleMode, { flush: 'sync' })
  }

  return { simpleMode, toggleSimpleMode, setSimpleMode }
}
