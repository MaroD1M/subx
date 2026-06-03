<template>
  <div>
    <UButton
      v-if="showFloatingEntry"
      label="首次使用引导"
      icon="i-lucide-sparkles"
      color="primary"
      variant="soft"
      size="sm"
      class="fixed right-5 bottom-5 z-40 shadow-lg"
      @click="openGuide = true"
    />

    <UModal v-model:open="openGuide" title="首次使用引导" description="按顺序完成这几步，基本就能正常开始使用。" :ui="{ width: '!max-w-3xl w-[92vw]' }">
      <template #content>
        <div class="p-5 sm:p-6 max-h-[82vh] overflow-y-auto custom-scrollbar space-y-5">
          <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div class="rounded-2xl border p-4" :class="stepCardClass(configReady)">
              <div class="flex items-center justify-between gap-3">
                <p class="text-sm font-semibold">1. 配置模型连接</p>
                <UBadge :color="configReady ? 'success' : 'warning'" variant="subtle">{{ configReady ? '已完成' : '待处理' }}</UBadge>
              </div>
              <p class="text-xs text-gray-500 dark:text-gray-400 mt-2 leading-relaxed">在“全局设置”中填写 API Key、Base URL 和默认模型。</p>
              <UButton label="打开全局设置" color="neutral" variant="ghost" size="sm" class="mt-3" @click="handleOpenSettings" />
            </div>

            <div class="rounded-2xl border p-4" :class="stepCardClass(mediaReady)">
              <div class="flex items-center justify-between gap-3">
                <p class="text-sm font-semibold">2. 检查媒体库</p>
                <UBadge :color="mediaReady ? 'success' : 'warning'" variant="subtle">{{ mediaReady ? '已完成' : '待处理' }}</UBadge>
              </div>
              <p class="text-xs text-gray-500 dark:text-gray-400 mt-2 leading-relaxed">确认媒体目录已挂载，并在媒体库管理中填写容器内路径。</p>
              <UButton label="前往媒体库管理" color="neutral" variant="ghost" size="sm" class="mt-3" to="/media-libraries" @click="openGuide = false" />
            </div>

            <div class="rounded-2xl border p-4" :class="stepCardClass(canStartUsing)">
              <div class="flex items-center justify-between gap-3">
                <p class="text-sm font-semibold">3. 开始任务</p>
                <UBadge :color="canStartUsing ? 'success' : 'neutral'" variant="subtle">{{ canStartUsing ? '就绪' : '完成前两步后可用' }}</UBadge>
              </div>
              <p class="text-xs text-gray-500 dark:text-gray-400 mt-2 leading-relaxed">回到首页，选择视频或字幕文件，检查轨道后开始翻译。</p>
              <UButton label="返回首页" color="primary" variant="soft" size="sm" class="mt-3" to="/" @click="openGuide = false" />
            </div>
          </div>

          <div class="rounded-2xl border border-gray-100 dark:border-gray-800 bg-gray-50/80 dark:bg-gray-900/35 p-4 space-y-3">
            <p class="text-sm font-semibold text-gray-800 dark:text-gray-100">建议操作顺序</p>
            <div class="space-y-2 text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
              <p>1. 如果你是 Docker 部署，先确认宿主机目录已经正确挂载到容器内。</p>
              <p>2. 媒体库页面里填写的是容器内路径，例如 <code>/media/movies</code>，不是宿主机路径。</p>
              <p>3. 若首页显示“当前媒体库暂不可访问”，优先检查挂载和权限，而不是前端界面。</p>
              <p>4. 模型连接保存后，建议返回首页试跑一个小文件验证流程。</p>
            </div>
          </div>

          <div class="rounded-2xl border border-amber-100 dark:border-amber-900/50 bg-amber-50/80 dark:bg-amber-950/20 p-4 space-y-2">
            <p class="text-sm font-semibold text-amber-700 dark:text-amber-300">当前状态提示</p>
            <ul class="space-y-2 text-xs text-amber-700/90 dark:text-amber-200/90 leading-relaxed">
              <li>{{ configReady ? '模型连接已配置。' : '尚未检测到完整的模型连接配置，请先填写 API Key 与默认模型。' }}</li>
              <li>{{ mediaReady ? '已检测到可用媒体库配置。' : '尚未检测到可用媒体库配置，建议先进入媒体库管理页面。' }}</li>
            </ul>
          </div>

          <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div class="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
              <USwitch v-model="dontShowAgain" />
              <span>不再自动弹出此引导</span>
            </div>
            <div class="flex items-center gap-2 sm:justify-end">
              <UButton label="稍后再看" color="neutral" variant="ghost" @click="closeGuide" />
              <UButton label="我知道了" color="primary" @click="closeGuide(true)" />
            </div>
          </div>
        </div>
      </template>
    </UModal>
  </div>
</template>

<script setup lang="ts">
import type { AppConfig } from '~~/types'

const props = withDefaults(defineProps<{
  config: Partial<AppConfig> | null
  open?: boolean
}>(), {
  open: false
})

const emit = defineEmits<{
  (e: 'open-settings'): void
  (e: 'update:open', value: boolean): void
}>()

const route = useRoute()
const openGuide = computed({
  get: () => props.open,
  set: (value: boolean) => emit('update:open', value)
})
const dontShowAgain = ref(false)
const GUIDE_DISMISSED_KEY = 'subx:onboarding:dismissed'
const GUIDE_DONE_KEY = 'subx:onboarding:done'

const configReady = computed(() => {
  const config = props.config || {}
  const apiKey = String(config.apiKey || '').trim()
  const apiKeyReady = apiKey.length > 0 && !/^\*+$/.test(apiKey)
  return apiKeyReady && !!String(config.apiBaseUrl || '').trim() && !!String(config.defaultModel || '').trim()
})

const mediaReady = computed(() => {
  const config = props.config || {}
  const roots = Array.isArray(config.mediaRoots) ? config.mediaRoots.filter((root: any) => root?.enabled !== false && root?.name && root?.path) : []
  return roots.length > 0
})

const canStartUsing = computed(() => configReady.value && mediaReady.value)
const showFloatingEntry = computed(() => route.path !== '/login' && route.path !== '/media-libraries')

function stepCardClass(done: boolean) {
  return done
    ? 'border-green-200 dark:border-green-900/40 bg-green-50/60 dark:bg-green-950/15'
    : 'border-gray-100 dark:border-gray-800 bg-white/80 dark:bg-gray-950/30'
}

function handleOpenSettings() {
  emit('open-settings')
  openGuide.value = false
}

function closeGuide(markDone = false) {
  openGuide.value = false
  if (!import.meta.client) return
  if (dontShowAgain.value) localStorage.setItem(GUIDE_DISMISSED_KEY, '1')
  if (markDone || canStartUsing.value) localStorage.setItem(GUIDE_DONE_KEY, '1')
}

onMounted(() => {
  if (!import.meta.client) return
  const dismissed = localStorage.getItem(GUIDE_DISMISSED_KEY) === '1'
  const done = localStorage.getItem(GUIDE_DONE_KEY) === '1'
  if (!dismissed && !done) {
    openGuide.value = true
  }
})

watch(canStartUsing, (ready) => {
  if (!import.meta.client || !ready) return
  localStorage.setItem(GUIDE_DONE_KEY, '1')
})
</script>
