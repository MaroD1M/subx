<template>
  <UApp>
    <div class="min-h-screen bg-gray-50/50 dark:bg-gray-950">
      <header v-if="!isLoginPage" class="glass-panel sticky top-4 z-50 rounded-2xl mx-4 sm:mx-6 lg:mx-8 max-w-7xl lg:inset-x-0 lg:mx-auto">
        <div class="h-16 px-4 sm:px-6 flex items-center justify-between">
          <div class="flex items-center gap-1 sm:gap-3 min-w-0">
            <img src="/favicon.ico" alt="SubX Logo" class="w-8 h-8 rounded-lg shadow-sm shrink-0" />
            <NuxtLink to="/" class="text-xl font-black text-primary-600 dark:text-primary-400 hover:opacity-80 transition-opacity shrink-0">SubX</NuxtLink>
            <span v-if="latestVersion && appVersion !== latestVersion" class="version-badge version-stale hidden md:inline-flex" title="有新版本可用">v{{ appVersion }} &#8593; v{{ latestVersion }}</span>
            <span v-else-if="latestVersion" class="version-badge version-ok hidden md:inline-flex" title="已是最新版">v{{ appVersion }} ✓</span>
            <span v-else class="version-badge version-err hidden md:inline-flex">v{{ appVersion }}</span>
            <div class="hidden md:flex items-center gap-0.5 ml-4">
              <UButton
                label="首页"
                icon="i-lucide-home"
                variant="ghost"
                size="sm"
                :color="route.path === '/' ? 'primary' : 'neutral'"
                :class="route.path === '/' ? 'font-semibold' : ''"
                to="/"
              />
              <UButton
                label="翻译历史"
                icon="i-lucide-history"
                variant="ghost"
                size="sm"
                :color="route.path === '/history' ? 'primary' : 'neutral'"
                :class="route.path === '/history' ? 'font-semibold' : ''"
                to="/history"
              />
              <UButton
                label="媒体库"
                icon="i-lucide-library-big"
                variant="ghost"
                size="sm"
                :color="route.path === '/media-libraries' ? 'primary' : 'neutral'"
                :class="route.path === '/media-libraries' ? 'font-semibold' : ''"
                to="/media-libraries"
              />
            </div>
          </div>
          <div class="flex items-center gap-1 sm:gap-2">
             <UButton icon="i-lucide-settings" variant="ghost" color="neutral" size="sm" title="全局设置" @click="isSettingsOpen = true" />
             <UButton v-if="authenticated" icon="i-lucide-log-out" variant="ghost" color="neutral" size="sm" title="登出" @click="handleLogout" />
             <UButton icon="i-lucide-github" variant="ghost" color="neutral" size="sm" to="https://github.com/chao-eng/subx" target="_blank" />
             <UButton
               :icon="colorMode.value === 'dark' ? 'i-lucide-moon' : 'i-lucide-sun'"
               variant="ghost"
               color="neutral"
               size="sm"
               @click="colorMode.preference = colorMode.value === 'dark' ? 'light' : 'dark'"
             />
          </div>
        </div>
      </header>

      <main :class="[isLoginPage ? 'w-full h-screen' : 'max-w-7xl mx-auto py-4 px-4 sm:px-6 lg:px-8']">
        <NuxtPage />
      </main>

      <UModal v-model:open="isSettingsOpen" title="设置" description="配置 AI 连接与默认翻译行为" :ui="{ width: '!max-w-5xl w-[94vw]' }">
        <template #content>
          <div class="p-5 sm:p-6 max-h-[85vh] overflow-y-auto custom-scrollbar">
            <Settings @close="isSettingsOpen = false" />
          </div>
        </template>
      </UModal>

      <UToaster />
    </div>
  </UApp>
</template>

<script setup>
const isSettingsOpen = useState('subx-settings-open', () => false)
const colorMode = useColorMode()
const { logout, authenticated } = useAuth()
const route = useRoute()

const isLoginPage = computed(() => route.path === '/login' || route.path === '/login/')
const runtimeConfig = useRuntimeConfig()
const appVersion = runtimeConfig.public.appVersion
const latestVersion = ref('')
onMounted(async () => {
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 5000)
    const res = await fetch('https://api.github.com/repos/MaroD1M/subx/tags?per_page=1', {
      headers: { Accept: 'application/vnd.github+json' },
      signal: controller.signal
    })
    clearTimeout(timer)
    if (res.ok) {
      const data = await res.json()
      if (Array.isArray(data) && data.length) {
        latestVersion.value = String(data[0].name || '').replace(/^v/, '')
      }
    }
  } catch { /* ignore — network unavailable */ }
})

const fallbackTitle = computed(() => {
  const path = route.path.replace(/\/$/, '') || '/'

  if (path === '/') return '首页 - SubX'
  if (path === '/login') return '身份验证 - SubX'
  if (path === '/history') return '翻译历史 - SubX'
  if (path === '/media-libraries') return '媒体库管理 - SubX'
    if (/^\/review\/[^/]+$/.test(path)) return '字幕核对 - SubX'
  if (/^\/task\/[^/]+$/.test(path)) return '翻译任务详情 - SubX'
  return 'SubX - 自动化视频字幕提取与翻译工具'
})

useHead(() => ({
  titleTemplate: (title) => title || fallbackTitle.value
}))

async function handleLogout() {
  await logout()
}
</script>

<style>
</style>
