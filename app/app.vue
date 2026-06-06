<template>
  <UApp>
    <div class="min-h-screen bg-gray-50/50 dark:bg-gray-950">
      <header v-if="!isLoginPage" class="glass-panel sticky top-4 z-50 rounded-2xl mx-4 sm:mx-6 lg:mx-8 max-w-7xl lg:inset-x-0 lg:mx-auto">
        <div class="h-16 px-4 sm:px-6 flex items-center justify-between">
          <div class="flex items-center gap-3 min-w-0">
            <img src="/favicon.ico" alt="SubX Logo" class="w-8 h-8 rounded-lg shadow-sm" />
            <NuxtLink to="/" class="text-xl font-black text-primary-600 dark:text-primary-400 hover:opacity-80 transition-opacity">SubX</NuxtLink>
            <span class="text-gray-300 dark:text-gray-700 font-light hidden md:inline-block">|</span>
            <span class="text-sm font-medium text-gray-500 dark:text-gray-400 hidden md:inline-block tracking-wide truncate">本地字幕提取与翻译</span>
          </div>
          <div class="flex items-center gap-4">
             <UButton icon="i-lucide-library-big" variant="ghost" color="neutral" to="/media-libraries" title="媒体库管理" />
             <UButton icon="i-lucide-settings" variant="ghost" color="neutral" title="全局设置" @click="isSettingsOpen = true" />
             <UButton v-if="authenticated" icon="i-lucide-log-out" variant="ghost" color="neutral" title="登出" @click="handleLogout" />
             <UButton icon="i-lucide-github" variant="ghost" color="neutral" to="https://github.com/chao-eng/subx" target="_blank" />
             <UButton
               :icon="colorMode.value === 'dark' ? 'i-lucide-moon' : 'i-lucide-sun'"
               variant="ghost"
               color="neutral"
               @click="colorMode.preference = colorMode.value === 'dark' ? 'light' : 'dark'"
             />
          </div>
        </div>
      </header>

      <main :class="[isLoginPage ? 'w-full h-screen' : 'max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8']">
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

async function handleLogout() {
  await logout()
}
</script>

<style>
</style>
