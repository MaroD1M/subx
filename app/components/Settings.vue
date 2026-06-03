<template>
  <div class="space-y-6">
    <div v-if="isInsecure" class="p-4 rounded-2xl bg-amber-50 dark:bg-amber-500/5 border border-amber-100 dark:border-amber-500/20 flex items-start gap-3 animate-pulse">
      <UIcon name="i-lucide-shield-alert" class="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
      <div class="space-y-1">
        <p class="text-xs font-bold text-amber-700 dark:text-amber-400">连接不安全</p>
        <p class="text-[10px] text-amber-600 dark:text-amber-500/80 leading-relaxed">检测到当前正在通过非 HTTPS 连接访问。您的 API 密钥在传输过程中可能存在泄露风险，建议启用 SSL 加密。</p>
      </div>
    </div>

    <div class="space-y-1">
      <div class="flex items-center justify-between">
        <label class="text-sm font-medium text-gray-700 dark:text-gray-300">OpenAI API 密钥</label>
        <UButton label="没有密钥？" variant="link" color="primary" size="xs" class="p-0 font-bold" @click="isHelpOpen = true" />
      </div>
      <p class="text-xs text-neutral-500 mb-2">您的 OpenAI 或代理 API 密钥。</p>
      <UInput v-model="config.apiKey" type="password" placeholder="sk-..." icon="i-lucide-key" class="w-full" @blur="tryFetchModels" />
    </div>

    <UFormField label="API 基础 URL" description="自定义 API 终点（例如 Ollama, One-API）。" class="w-full">
      <UInput v-model="config.apiBaseUrl" placeholder="https://api.openai.com/v1" icon="i-lucide-globe" class="w-full" @blur="tryFetchModels" />
    </UFormField>

    <UFormField label="默认模型">
      <div class="space-y-2">
        <div class="flex gap-2">
          <USelect v-if="modelItems.length && !useManualModelInput" v-model="config.defaultModel" :items="modelItems" class="flex-1 min-w-0" :ui="{ width: 'w-full' }" />
          <UInput v-else v-model="config.defaultModel" placeholder="手动输入模型名，例如 gpt-4o-mini" class="flex-1" />
          <UButton icon="i-lucide-refresh-cw" color="neutral" variant="ghost" size="sm" :loading="fetchingModels" @click="tryFetchModels" title="获取模型列表" />
        </div>
        <div v-if="modelItems.length" class="flex items-center justify-between gap-3 p-2 rounded-lg border border-gray-100 dark:border-gray-800 bg-gray-50/70 dark:bg-gray-900/40">
          <div class="text-xs text-gray-500 dark:text-gray-400">已加载模型列表，也可切换为手动输入</div>
          <USwitch v-model="useManualModelInput" />
        </div>
        <div v-if="fetchingModels" class="flex items-center gap-2 text-xs text-gray-500"><UIcon name="i-lucide-loader-2" class="w-3 h-3 animate-spin" />正在获取模型列表...</div>
        <div v-else-if="modelError" class="text-xs text-amber-600 dark:text-amber-400">{{ modelError }}</div>
        <div v-else-if="modelItems.length" class="text-xs text-green-600 dark:text-green-400">已加载 {{ modelItems.length }} 个可用模型</div>
      </div>
    </UFormField>

    <div class="grid grid-cols-2 gap-4">
      <UFormField label="目标语言"><USelect v-model="config.targetLanguage" :items="['zh-CN', 'zh-TW', 'en', 'ja', 'ko']" class="w-full" /></UFormField>
      <UFormField label="输出模式"><USelect v-model="config.outputMode" :items="outputModeItems" class="w-full" /></UFormField>
    </div>

    <div class="grid grid-cols-4 gap-4 items-stretch">
      <UFormField label="分块大小 (Token)" description="较小的值可防止 AI 输出被截断。" class="flex flex-col h-full" :ui="{ container: 'mt-auto' }"><UInputNumber v-model="config.chunkSize" :min="100" :max="6000" :step="100" class="w-full" /></UFormField>
      <UFormField label="并发任务数" description="同时进行的翻译请求数量。" class="flex flex-col h-full" :ui="{ container: 'mt-auto' }"><UInputNumber v-model="config.concurrency" :min="1" :max="10" class="w-full" /></UFormField>
      <UFormField label="最大重试次数" description="翻译失败或漏译时自动重跑次数。" class="flex flex-col h-full" :ui="{ container: 'mt-auto' }"><UInputNumber v-model="config.maxRetries" :min="0" :max="5" class="w-full" /></UFormField>
      <UFormField label="日志保留天数" description="AI 日志在 ai-logs 中的保留天数。" class="flex flex-col h-full" :ui="{ container: 'mt-auto' }"><UInputNumber v-model="config.logRetentionDays" :min="1" :max="30" class="w-full" /></UFormField>
    </div>

    <div class="p-4 rounded-2xl border border-gray-100 dark:border-gray-800 bg-gray-50/70 dark:bg-gray-900/40 space-y-4">
      <div class="flex items-start justify-between gap-4">
        <div>
          <p class="text-sm font-semibold text-gray-800 dark:text-gray-100">媒体库管理</p>
          <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">支持配置多个容器内媒体根目录；可设置默认库、调整顺序并即时检测访问状态。</p>
        </div>
        <div class="flex items-center gap-2">
          <UButton label="批量检测" icon="i-lucide-scan-search" size="sm" color="neutral" variant="ghost" :loading="batchInspecting" @click="inspectAllRoots()" />
          <UButton label="新增媒体库" icon="i-lucide-plus" size="sm" color="neutral" variant="soft" @click="addMediaRoot" />
        </div>
      </div>

      <div class="space-y-3">
        <div v-for="(root, index) in mediaRoots" :key="root.id" class="p-3 rounded-xl border border-gray-200/70 dark:border-gray-700/70 bg-white/80 dark:bg-gray-950/40 space-y-3">
          <div class="grid grid-cols-12 gap-3 items-start">
            <div class="col-span-3"><UFormField label="显示名称"><UInput v-model="root.name" placeholder="例如：电影库" class="w-full" /></UFormField></div>
            <div class="col-span-6"><UFormField label="容器内路径"><UInput v-model="root.path" placeholder="例如：/media/movies" class="w-full font-mono text-xs" /></UFormField></div>
            <div class="col-span-2 pt-7 flex items-center gap-2"><USwitch :model-value="root.isDefault" @update:model-value="setDefaultRoot(index)" /><span class="text-xs text-gray-500">默认</span></div>
            <div class="col-span-1 pt-7 flex justify-end gap-1"><UButton icon="i-lucide-arrow-up" color="neutral" variant="ghost" size="sm" :disabled="index === 0" @click="moveRoot(index, -1)" /><UButton icon="i-lucide-arrow-down" color="neutral" variant="ghost" size="sm" :disabled="index === mediaRoots.length - 1" @click="moveRoot(index, 1)" /><UButton icon="i-lucide-trash-2" color="error" variant="ghost" size="sm" @click="removeMediaRoot(index)" /></div>
          </div>

          <div class="flex items-center justify-between gap-3">
            <div class="flex items-center gap-3 text-xs min-w-0">
              <UBadge :color="root.enabled !== false ? 'success' : 'neutral'" variant="subtle">{{ root.enabled !== false ? '已启用' : '已停用' }}</UBadge>
              <UBadge v-if="inspectionStates[root.id]" :color="inspectionStates[root.id].ok ? 'success' : 'error'" variant="subtle">{{ inspectionStates[root.id].ok ? '可访问' : '不可访问' }}</UBadge>
              <div v-if="inspectionStates[root.id]" class="min-w-0"><p class="text-gray-500 dark:text-gray-400 truncate">{{ inspectionStates[root.id].message }}</p><p v-if="inspectionStates[root.id].path" class="text-[11px] text-gray-400 dark:text-gray-500 font-mono truncate">{{ inspectionStates[root.id].path }}</p></div>
            </div>
            <div class="flex items-center gap-2"><USwitch v-model="root.enabled" /><UButton label="检测路径" size="xs" color="neutral" variant="ghost" :loading="inspectingId === root.id" @click="inspectRoot(root)" /></div>
          </div>
        </div>

        <div v-if="!mediaRoots.length" class="text-xs text-gray-500 dark:text-gray-400 p-3 rounded-xl border border-dashed border-gray-300 dark:border-gray-700">当前未配置媒体库，系统会使用环境变量 `VIDEO_DIR` 作为默认媒体目录。</div>
      </div>
    </div>

    <div class="p-4 rounded-xl bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-700 flex items-center justify-between cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors" @click="config.streamUsage = !config.streamUsage">
      <div class="space-y-0.5"><label class="text-sm font-medium text-gray-700 dark:text-gray-300">流式统计 (Stream Usage)</label><p class="text-[11px] text-gray-500 dark:text-gray-400">实时统计 Token 消耗。部分第三方 API 可能不兼容导致报错，若遇到“0字节/解析失败”可尝试关闭。</p></div>
      <USwitch v-model="config.streamUsage" @click.stop />
    </div>

    <div class="flex items-center justify-between gap-3 pt-2"><div v-if="hasUnsavedChanges" class="text-xs text-amber-600 dark:text-amber-400">有未保存的更改</div>
      <div class="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
        <USwitch v-model="forceSaveInvalidRoots" />
        <span>允许带无效媒体库强制保存</span>
      </div>
      <div class="flex items-center gap-3">
        <UButton label="取消" color="neutral" variant="ghost" @click="handleClose" />
        <UButton label="保存修改" color="primary" :loading="pending" @click="save" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { MediaRoot } from '~~/types'

const emit = defineEmits(['close'])
const isHelpOpen = ref(false)
const { data } = await useFetch('/api/config')
const config = ref<any>(data.value || {})
const pending = ref(false)
const toast = useToast()
const outputModeItems = [
  { label: '仅显示译文', value: 'translated' },
  { label: '双语对照', value: 'bilingual' },
  { label: '仅导出原字幕', value: 'original' }
]

if (config.value) {
  if (config.value.chunkSize) config.value.chunkSize = Number(config.value.chunkSize)
  if (config.value.concurrency) config.value.concurrency = Number(config.value.concurrency)
  if (config.value.maxRetries) config.value.maxRetries = Number(config.value.maxRetries)
  if (config.value.logRetentionDays) config.value.logRetentionDays = Number(config.value.logRetentionDays)
  if (config.value.streamUsage === undefined) config.value.streamUsage = false
}

const mediaRoots = ref<MediaRoot[]>(Array.isArray(config.value?.mediaRoots) ? [...config.value.mediaRoots] : [])
const inspectionStates = ref<Record<string, { ok: boolean, message: string, path?: string }>>({})
const inspectingId = ref('')
const batchInspecting = ref(false)
const forceSaveInvalidRoots = ref(false)
const initialSnapshot = ref('')

const modelItems = ref<any[]>([])
const useManualModelInput = ref(false)
const fetchingModels = ref(false)
const modelError = ref('')
const MODEL_INPUT_MODE_KEY = 'subx:settings:model-input-mode'
const isInsecure = computed(() => {
  if (!import.meta.client) return false
  return window.location.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(window.location.hostname)
})

const currentSnapshot = computed(() => JSON.stringify({ config: { ...config.value, apiKey: '', mediaRoots: undefined }, mediaRoots: sanitizeMediaRoots(), forceSaveInvalidRoots: forceSaveInvalidRoots.value }))
const hasUnsavedChanges = computed(() => initialSnapshot.value !== '' && currentSnapshot.value !== initialSnapshot.value)

onMounted(() => {
  const savedMode = localStorage.getItem(MODEL_INPUT_MODE_KEY)
  if (savedMode === 'manual') useManualModelInput.value = true
  if (config.value?.apiKey && config.value?.apiBaseUrl) tryFetchModels()
  initialSnapshot.value = currentSnapshot.value
  if (mediaRoots.value.length && !mediaRoots.value.some(root => root.isDefault)) {
    mediaRoots.value[0].isDefault = true
  }
})

watch(useManualModelInput, (val) => {
  if (!import.meta.client) return
  localStorage.setItem(MODEL_INPUT_MODE_KEY, val ? 'manual' : 'select')
})

function addMediaRoot() {
  mediaRoots.value.push({ id: `root-${Date.now()}`, name: `媒体库 ${mediaRoots.value.length + 1}`, path: '', enabled: true, order: mediaRoots.value.length, isDefault: mediaRoots.value.length === 0 })
}

function removeMediaRoot(index: number) {
  const removed = mediaRoots.value[index]
  mediaRoots.value.splice(index, 1)
  if (removed?.id) delete inspectionStates.value[removed.id]
  if (removed?.isDefault && mediaRoots.value.length) mediaRoots.value[0].isDefault = true
}

function setDefaultRoot(index: number) {
  mediaRoots.value.forEach((root, i) => { root.isDefault = i === index })
}

function moveRoot(index: number, delta: number) {
  const target = index + delta
  if (target < 0 || target >= mediaRoots.value.length) return
  const arr = [...mediaRoots.value]
  const [item] = arr.splice(index, 1)
  arr.splice(target, 0, item)
  mediaRoots.value = arr.map((root, i) => ({ ...root, order: i }))
}

async function inspectRoot(root: MediaRoot) {
  inspectingId.value = root.id
  try {
    const result = await $fetch('/api/media-roots/inspect', { method: 'POST', body: { root } })
    inspectionStates.value[root.id] = { ok: !!result.ok, message: result.message, path: result.path }
  } catch (e: any) {
    inspectionStates.value[root.id] = { ok: false, message: e?.data?.message || '检测失败', path: root.path }
  } finally {
    inspectingId.value = ''
  }
}

async function inspectAllRoots(showToast = true) {
  batchInspecting.value = true
  try {
    const res = await $fetch('/api/media-roots/inspect-all', { method: 'POST', body: { roots: sanitizeMediaRoots() } })
    for (const item of res.results || []) {
      inspectionStates.value[item.id] = { ok: !!item.ok, message: item.message, path: item.path }
    }
    if (showToast) {
      toast.add({ title: '检测完成', description: `已检测 ${res.results?.length || 0} 个媒体库`, color: 'success' })
    }
    return res.results || []
  } catch (e: any) {
    if (showToast) {
      toast.add({ title: '检测失败', description: e?.data?.message || '无法批量检测媒体库', color: 'danger' })
    }
    throw e
  } finally {
    batchInspecting.value = false
  }
}

async function tryFetchModels() {
  const apiKey = config.value?.apiKey?.trim()
  const baseURL = config.value?.apiBaseUrl?.trim()
  if (!apiKey || !baseURL) return

  fetchingModels.value = true
  modelError.value = ''
  try {
    const res = await $fetch('/api/model-list', { method: 'POST', body: { apiKey, baseURL } })
    modelItems.value = res.models.map((m: any) => ({ label: m.id.startsWith('models/') ? m.id.replace('models/', '') : m.id, value: m.id }))
  } catch {
    modelError.value = '无法获取模型列表，请检查密钥和 URL 是否正确'
    modelItems.value = []
  } finally {
    fetchingModels.value = false
  }
}

function sanitizeMediaRoots() {
  return mediaRoots.value.map((root, index) => ({
    id: String(root.id || `root-${index + 1}`),
    name: String(root.name || '').trim(),
    path: String(root.path || '').trim(),
    enabled: root.enabled !== false,
    isDefault: root.isDefault === true,
    order: index
  }))
}

function handleClose() {
  if (hasUnsavedChanges.value && !window.confirm('当前有未保存的更改，确定关闭设置吗？')) return
  emit('close')
}

async function save() {
  pending.value = true
  try {
    const roots = sanitizeMediaRoots()
    const enabledRoots = roots.filter(root => root.enabled !== false)

    if (enabledRoots.length > 0) {
      const results = await inspectAllRoots(false)
      const failedRoots = results.filter((item: any) => enabledRoots.some(root => root.id === item.id) && !item.ok)
      if (failedRoots.length > 0 && !forceSaveInvalidRoots.value) {
        toast.add({ title: '存在不可访问的媒体库', description: `请先修复 ${failedRoots.length} 个无效媒体库，或将其停用后再保存。`, color: 'warning' })
        return
      }
    }

    await $fetch('/api/config', { method: 'PUT', body: { ...config.value, mediaRoots: roots } })
    toast.add({ title: '成功', description: '设置已保存', color: 'success' })
    initialSnapshot.value = currentSnapshot.value
    emit('close')
  } catch (e: any) {
    toast.add({ title: '错误', description: e?.data?.message || e?.message || '无法保存设置，请检查登录状态', color: 'danger' })
  } finally {
    pending.value = false
  }
}
</script>
