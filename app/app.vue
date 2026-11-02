<template>
  <UApp>
    <div class="min-h-screen bg-gray-50/50 dark:bg-gray-950">
      <a
        v-if="!isLoginPage"
        href="#main-content"
        class="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:rounded-lg focus:bg-white focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-primary-700 focus:shadow-lg dark:focus:bg-gray-950 dark:focus:text-primary-300"
      >
        跳到主要内容
      </a>
      <header v-if="!isLoginPage" class="sticky top-0 z-50 border-b border-gray-200/80 bg-white/90 backdrop-blur-md dark:border-gray-800 dark:bg-gray-950/90">
        <AppContainer class="flex h-16 items-center justify-between px-4 sm:px-6 lg:px-8">
          <div class="flex min-w-0 items-center gap-1 sm:gap-3">
            <NuxtLink to="/" class="flex shrink-0 items-center gap-2.5" aria-label="SubX 首页">
              <img src="/logo.svg" alt="" class="h-8 w-8 rounded-xl shadow-sm" />
              <span class="text-xl font-black text-primary-700 transition-opacity hover:opacity-80 dark:text-primary-400">SubX</span>
            </NuxtLink>
            <span v-if="latestVersion && appVersion !== latestVersion" class="version-badge version-stale hidden md:inline-flex" title="有新版本可用">v{{ appVersion }} &#8593; v{{ latestVersion }}</span>
            <span v-else-if="latestVersion" class="version-badge version-ok hidden md:inline-flex" title="已是最新版">v{{ appVersion }} ✓</span>
            <span v-else class="version-badge version-err hidden md:inline-flex">v{{ appVersion }}</span>
            <nav class="ml-4 hidden items-center gap-0.5 md:flex" aria-label="主导航">
              <UButton
                v-for="item in navItems"
                :key="item.to"
                :label="item.label"
                :icon="item.icon"
                variant="ghost"
                size="sm"
                :color="isNavActive(item.to) ? 'primary' : 'neutral'"
                :class="isNavActive(item.to) ? 'font-semibold' : ''"
                :to="item.to"
              />
            </nav>
          </div>
          <div class="flex items-center gap-1 sm:gap-1.5">
             <UButton v-if="authenticated" icon="i-lucide-log-out" variant="ghost" color="neutral" size="sm" title="登出" aria-label="登出" @click="handleLogout" />
             <UButton icon="i-lucide-github" variant="ghost" color="neutral" size="sm" aria-label="打开 GitHub 项目页" to="https://github.com/MaroD1M/subx" target="_blank" />
             <UButton
               :icon="colorMode.value === 'dark' ? 'i-lucide-moon' : 'i-lucide-sun'"
               variant="ghost"
               color="neutral"
               size="sm"
               :aria-label="colorMode.value === 'dark' ? '切换到浅色模式' : '切换到深色模式'"
               @click="colorMode.preference = colorMode.value === 'dark' ? 'light' : 'dark'"
             />
          </div>
        </AppContainer>
      </header>

      <main id="main-content" tabindex="-1" :class="[isLoginPage ? 'h-screen w-full' : 'px-4 py-5 pb-24 sm:px-6 md:pb-8 lg:px-8']">
        <NuxtPage />
      </main>

      <MobileNav v-if="!isLoginPage" />
      <UToaster />
    </div>
  </UApp>
</template>

<script setup>
const colorMode = useColorMode()
const { logout, authenticated } = useAuth()
const route = useRoute()

const isLoginPage = computed(() => route.path === '/login' || route.path === '/login/')
const navItems = [
  { label: '首页', icon: 'i-lucide-home', to: '/' },
  { label: '翻译历史', icon: 'i-lucide-history', to: '/history' },
  { label: '媒体库', icon: 'i-lucide-library-big', to: '/media-libraries' },
  { label: '自动化', icon: 'i-lucide-workflow', to: '/automation' },
  { label: '设置', icon: 'i-lucide-settings', to: '/settings' }
]

function isNavActive(path) {
  if (path === '/') return route.path === '/'
  return route.path.startsWith(path)
}

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
  if (path === '/automation') return '自动化 - SubX'
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
