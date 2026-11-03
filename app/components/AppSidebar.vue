<template>
  <aside
    class="sticky top-0 z-40 hidden h-screen shrink-0 flex-col border-r border-gray-200/80 bg-white/85 backdrop-blur-xl transition-[width] duration-200 dark:border-gray-800/80 dark:bg-gray-950/80 xl:flex"
    :class="collapsed ? 'w-16' : 'w-60'"
  >
    <div class="flex h-16 shrink-0 items-center border-b border-gray-100/90 px-3 dark:border-gray-800/80">
      <NuxtLink to="/" class="flex min-w-0 items-center gap-2.5" aria-label="SubX 首页">
        <img src="/logo.svg" alt="" class="h-9 w-9 shrink-0 rounded-xl shadow-sm" />
        <span v-if="!collapsed" class="truncate text-xl font-black text-primary-700 dark:text-primary-400">SubX</span>
      </NuxtLink>
      <UButton
        v-if="!collapsed"
        icon="i-lucide-panel-left-close"
        variant="ghost"
        color="neutral"
        size="xs"
        class="ml-auto"
        title="收起侧栏"
        aria-label="收起侧栏"
        @click="emit('toggle')"
      />
    </div>

    <nav class="min-h-0 flex-1 space-y-1 overflow-y-auto px-2 py-3" aria-label="主导航">
      <NuxtLink
        v-for="item in navItems"
        :key="item.to"
        :to="item.to"
        :title="collapsed ? item.label : undefined"
        :aria-label="item.label"
        class="group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors"
        :class="isActive(item.to)
          ? 'bg-primary-50 text-primary-700 dark:bg-primary-500/10 dark:text-primary-300'
          : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-gray-900 dark:hover:text-white'"
        :aria-current="isActive(item.to) ? 'page' : undefined"
      >
        <UIcon :name="item.icon" class="h-5 w-5 shrink-0" />
        <span v-if="!collapsed" class="truncate">{{ item.label }}</span>
        <span v-if="!collapsed && isActive(item.to)" class="ml-auto h-1.5 w-1.5 rounded-full bg-primary-500" />
      </NuxtLink>
    </nav>

    <div class="shrink-0 border-t border-gray-100/90 p-2 dark:border-gray-800/80">
      <div v-if="!collapsed" class="mb-2 flex items-center rounded-xl bg-gray-50/80 px-2.5 py-2 dark:bg-gray-900/50">
        <span class="version-badge version-ok" :title="versionTitle">v{{ appVersion }}</span>
      </div>
      <div class="space-y-1">
        <UButton
          :icon="collapsed ? 'i-lucide-panel-left-open' : 'i-lucide-sun-moon'"
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
const props = defineProps<{
  collapsed: boolean
  appVersion: string
  latestVersion?: string
}>()

const emit = defineEmits<{
  toggle: []
}>()

const route = useRoute()
const colorMode = useColorMode()
const { authenticated, logout } = useAuth()

const navItems = [
  { label: '首页', icon: 'i-lucide-home', to: '/' },
  { label: '翻译历史', icon: 'i-lucide-history', to: '/history' },
  { label: '媒体库', icon: 'i-lucide-library-big', to: '/media-libraries' },
  { label: '自动化', icon: 'i-lucide-workflow', to: '/automation' },
  { label: '设置', icon: 'i-lucide-settings', to: '/settings' }
]

function isActive(path: string) {
  if (path === '/') return route.path === '/'
  if (path === '/history') {
    return route.path.startsWith('/history') || route.path.startsWith('/task') || route.path.startsWith('/review')
  }
  return route.path.startsWith(path)
}

const versionTitle = computed(() => {
  if (!props.latestVersion) return '版本检查不可用'
  return props.latestVersion === props.appVersion ? '已是最新版' : `有新版本 v${props.latestVersion}`
})

async function handleLogout() {
  await logout()
}
</script>
