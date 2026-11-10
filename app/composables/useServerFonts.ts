import { ref } from 'vue'

export interface ServerFontResponse {
  fonts: string[]
  available: boolean
}

const fonts = ref<string[]>([])
const available = ref(false)
const loading = ref(false)
const loaded = ref(false)

export function useServerFonts() {
  async function load(force = false) {
    if (loading.value) return
    if (loaded.value && !force) return
    loading.value = true
    try {
      const response = await $fetch<ServerFontResponse>('/api/fonts')
      fonts.value = Array.isArray(response?.fonts) ? response.fonts : []
      available.value = response?.available === true
      loaded.value = true
    } catch {
      fonts.value = []
      available.value = false
    } finally {
      loading.value = false
    }
  }

  return { fonts, available, loading, loaded, load }
}
