<template>
  <aside
    class="sticky top-0 z-40 hidden h-screen shrink-0 flex-col border-r border-gray-200/80 bg-[var(--surface-strong)] transition-[width] duration-200 dark:border-gray-800/80 xl:flex"
    :class="collapsed ? 'w-16' : 'w-[248px]'"
  >
    <div class="flex h-14 shrink-0 items-center border-b border-gray-100/90 px-3 dark:border-gray-800/80">
      <NuxtLink to="/" class="flex min-w-0 items-center gap-2.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/50" aria-label="SubX 首页">
        <img src="/logo.svg" alt="" class="h-8 w-8 shrink-0 rounded-lg" />
        <span v-if="!collapsed" class="truncate text-lg font-bold text-gray-900 dark:text-white">SubX</span>
      </NuxtLink>
      <UButton
        v-if="!collapsed"
        icon="i-lucide-panel-left-close"
        variant="ghost"
        color="neutral"
        size="sm"
        class="ml-auto h-8 w-8 p-0"
        title="收起侧栏"
        aria-label="收起侧栏"
        @click="emit('toggle')"
      />
    </div>

    <nav class="min-h-0 flex-1 overflow-y-auto px-2 py-3" aria-label="主导航">
      <div class="space-y-1">
        <NuxtLink
          v-for="item in navItems"
          :key="item.to"
          :to="item.to"
          prefetch-on="interaction"
          :title="collapsed ? item.label : undefined"
          :aria-label="item.label"
          class="group relative flex items-center rounded-lg text-sm leading-6 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/50"
          :class="[
            collapsed ? 'justify-center py-2.5' : 'gap-3 px-3 py-2.5',
            isActive(item.to)
              ? 'bg-primary-50 font-semibold text-primary-700 dark:bg-primary-500/10 dark:text-primary-300'
              : 'font-medium text-gray-600 hover:bg-gray-100/70 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-gray-800/60 dark:hover:text-white'
          ]"
          :aria-current="isActive(item.to) ? 'page' : undefined"
        >
          <span v-if="isActive(item.to)" class="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-primary-600 dark:bg-primary-400" />
          <UIcon :name="item.icon" class="h-[18px] w-[18px] shrink-0" />
          <span v-if="!collapsed" class="truncate">{{ item.label }}</span>
        </NuxtLink>
      </div>
    </nav>

    <div class="shrink-0 border-t border-gray-100/90 p-2 dark:border-gray-800/80">
      <div v-if="!collapsed" class="mb-2 flex items-center rounded-lg border border-gray-100 bg-gray-50/70 px-2.5 py-1.5 dark:border-gray-800 dark:bg-gray-900/40">
        <span class="version-badge version-ok" :title="versionTitle">v{{ appVersion }}</span>
      </div>
      <div class="space-y-1">
        <UButton
          icon="i-lucide-wand-sparkles"
          :label="collapsed ? undefined : (simpleMode ? '完整模式' : '简洁模式')"
          variant="ghost"
          color="neutral"
          size="sm"
          class="w-full"
          :class="collapsed ? 'justify-center' : 'justify-start'"
          :title="simpleMode ? '切换到完整模式' : '切换到简洁模式'"
          :aria-label="simpleMode ? '切换到完整模式' : '切换到简洁模式'"
          @click="toggleSimpleMode"
        />
        <UButton
          :icon="colorMode.value === 'dark' ? 'i-lucide-sun' : 'i-lucide-moon'"
          :label="collapsed ? undefined : (colorMode.value === 'dark' ? '浅色模式' : '深色模式')"
          variant="ghost"
          color="neutral"
          size="sm"
          class="w-full"
          :class="collapsed ? 'justify-center' : 'justify-start'"
          :title="colorMode.value === 'dark' ? '切换到浅色模式' : '切换到深色模式'"
          :aria-label="colorMode.value === 'dark' ? '切换到浅色模式' : '切换到深色模式'"
          @click="colorMode.preference = colorMode.value === 'dark' ? 'light' : 'dark'"
        />
        <UButton
          icon="i-lucide-github"
          :label="collapsed ? undefined : 'GitHub'"
          variant="ghost"
          color="neutral"
          size="sm"
          class="w-full"
          :class="collapsed ? 'justify-center' : 'justify-start'"
          to="https://github.com/MaroD1M/subx"
          target="_blank"
          title="打开 GitHub 项目页"
          aria-label="打开 GitHub 项目页"
        />
        <UButton
          v-if="authenticated"
          icon="i-lucide-log-out"
          :label="collapsed ? undefined : '退出登录'"
          variant="ghost"
          color="neutral"
          size="sm"
          class="w-full"
          :class="collapsed ? 'justify-center' : 'justify-start'"
          title="登出"
          aria-label="登出"
          @click="handleLogout"
        />
        <UButton
          v-if="collapsed"
          icon="i-lucide-panel-left-open"
          variant="ghost"
          color="neutral"
          size="sm"
          class="w-full justify-center"
          title="展开侧栏"
          aria-label="展开侧栏"
          @click="emit('toggle')"
        />
      </div>
    </div>
  </aside>
</template>

<script setup lang="ts">
import { useSimpleMode } from '../composables/useSimpleMode'

const props = defineProps<{
  collapsed: boolean
  appVersion: string
  latestVersion?: string
}>()

const emit = defineEmits<{
  toggle: []
}>()

const colorMode = useColorMode()
const { navItems, isActive } = useNavigation()
const { simpleMode, toggleSimpleMode } = useSimpleMode()
const { authenticated, logout } = useAuth()

const versionTitle = computed(() => {
  if (!props.latestVersion) return '版本检查不可用'
  return props.latestVersion === props.appVersion ? '已是最新版' : `有新版本 v${props.latestVersion}`
})

async function handleLogout() {
  await logout()
}
</script>
