<template>
  <div class="space-y-5">
    <div v-if="isInsecure" class="p-4 rounded-2xl bg-amber-50 dark:bg-amber-500/5 border border-amber-100 dark:border-amber-500/20 flex items-start gap-3 animate-pulse">
      <UIcon name="i-lucide-shield-alert" class="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
      <div class="space-y-1">
        <p class="text-xs font-bold text-amber-700 dark:text-amber-400">连接不安全</p>
        <p class="text-[10px] text-amber-600 dark:text-amber-500/80 leading-relaxed">检测到当前正在通过非 HTTPS 连接访问。您的 API 密钥在传输过程中可能存在泄露风险，建议启用 SSL 加密。</p>
      </div>
    </div>

    <div class="rounded-2xl border border-gray-100 dark:border-gray-800 bg-white/80 dark:bg-gray-950/30 p-4 sm:p-5 space-y-5">
      <div class="flex items-center justify-between gap-3">
        <div>
          <p class="text-sm font-semibold text-gray-800 dark:text-gray-100">模型与连接</p>
          <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">配置 API 密钥、网关地址和默认模型。</p>
        </div>
        <UButton label="没有密钥？" variant="link" color="primary" size="xs" class="p-0 font-bold" @click="isHelpOpen = true" />
      </div>

      <div class="space-y-1">
        <label class="text-sm font-medium text-gray-700 dark:text-gray-300">OpenAI API 密钥</label>
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
    </div>

    <div class="rounded-2xl border border-gray-100 dark:border-gray-800 bg-white/80 dark:bg-gray-950/30 p-4 sm:p-5 space-y-5">
      <div>
        <p class="text-sm font-semibold text-gray-800 dark:text-gray-100">翻译默认参数</p>
        <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">这些设置会作为新任务的默认值。</p>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <UFormField label="目标语言">
          <USelect v-model="config.targetLanguage" :items="['zh-CN', 'zh-TW', 'en', 'ja', 'ko']" class="w-full" />
        </UFormField>
        <UFormField label="输出模式">
          <USelect v-model="config.outputMode" :items="outputModeItems" class="w-full" />
        </UFormField>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-4 items-stretch">
        <UFormField label="分块大小 (Token)" description="较小的值可防止 AI 输出被截断。" class="h-full rounded-xl border border-gray-100 dark:border-gray-800 bg-gray-50/60 dark:bg-gray-900/30 p-3 flex flex-col" :ui="{ container: 'mt-auto' }">
          <UInputNumber v-model="config.chunkSize" :min="100" :max="6000" :step="100" class="w-full mt-auto" :ui="{ base: 'w-full', wrapper: 'w-full', increment: 'shrink-0', decrement: 'shrink-0' }" />
        </UFormField>
        <UFormField label="并发任务数" description="同时进行的翻译请求数量。" class="h-full rounded-xl border border-gray-100 dark:border-gray-800 bg-gray-50/60 dark:bg-gray-900/30 p-3 flex flex-col" :ui="{ container: 'mt-auto' }">
          <UInputNumber v-model="config.concurrency" :min="1" :max="10" class="w-full mt-auto" :ui="{ base: 'w-full', wrapper: 'w-full', increment: 'shrink-0', decrement: 'shrink-0' }" />
        </UFormField>
        <UFormField label="最大重试次数" description="翻译失败或漏译时自动重跑次数。" class="h-full rounded-xl border border-gray-100 dark:border-gray-800 bg-gray-50/60 dark:bg-gray-900/30 p-3 flex flex-col" :ui="{ container: 'mt-auto' }">
          <UInputNumber v-model="config.maxRetries" :min="0" :max="5" class="w-full mt-auto" :ui="{ base: 'w-full', wrapper: 'w-full', increment: 'shrink-0', decrement: 'shrink-0' }" />
        </UFormField>
        <UFormField label="日志保留天数" description="AI 日志在 ai-logs 中的保留天数。" class="h-full rounded-xl border border-gray-100 dark:border-gray-800 bg-gray-50/60 dark:bg-gray-900/30 p-3 flex flex-col" :ui="{ container: 'mt-auto' }">
          <UInputNumber v-model="config.logRetentionDays" :min="1" :max="30" class="w-full mt-auto" :ui="{ base: 'w-full', wrapper: 'w-full', increment: 'shrink-0', decrement: 'shrink-0' }" />
        </UFormField>
      </div>

      <div class="rounded-xl bg-gray-50/80 dark:bg-gray-900/40 border border-gray-100 dark:border-gray-800 p-3.5">
        <div class="flex items-center justify-between gap-3 cursor-pointer" @click="config.streamUsage = !config.streamUsage">
          <div class="space-y-0.5">
            <label class="text-sm font-medium text-gray-700 dark:text-gray-300">流式统计 (Stream Usage)</label>
            <p class="text-[11px] text-gray-500 dark:text-gray-400">实时统计 Token 消耗。部分第三方 API 可能不兼容导致报错，若遇到“0字节/解析失败”可尝试关闭。</p>
          </div>
          <USwitch v-model="config.streamUsage" @click.stop />
        </div>
      </div>
    </div>

    <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-1">
      <div v-if="hasUnsavedChanges" class="text-xs text-amber-600 dark:text-amber-400">有未保存的更改</div>
      <div class="flex items-center gap-3 sm:ml-auto">
        <UButton label="取消" color="neutral" variant="ghost" @click="handleClose" />
        <UButton label="保存修改" color="primary" :loading="pending" @click="save" />
      </div>
    </div>

    <UModal v-model:open="closeConfirmOpen" title="放弃未保存的更改？" description="当前设置尚未保存，关闭后会丢失本次修改。" :ui="{ width: '!max-w-md w-[92vw]' }">
      <template #content>
        <div class="p-5 space-y-4">
          <div class="rounded-xl border border-amber-100 dark:border-amber-900/40 bg-amber-50/80 dark:bg-amber-950/20 p-3 text-sm text-amber-700 dark:text-amber-300">
            你可以先保存修改，或确认放弃本次更改。
          </div>
          <div class="flex items-center justify-end gap-3">
            <UButton label="继续编辑" color="neutral" variant="ghost" @click="closeConfirmOpen = false" />
            <UButton label="放弃更改" color="warning" @click="confirmCloseWithoutSaving" />
          </div>
        </div>
      </template>
    </UModal>
  </div>
</template>

<script setup lang="ts">
const emit = defineEmits(['close'])
const isHelpOpen = ref(false)
const { data } = await useFetch('/api/config')
const config = ref<any>(data.value || {})
const pending = ref(false)
const closeConfirmOpen = ref(false)
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

function buildConfigSnapshot(value: any) {
  return JSON.stringify({
    apiBaseUrl: String(value?.apiBaseUrl || ''),
    defaultModel: String(value?.defaultModel || ''),
    targetLanguage: String(value?.targetLanguage || ''),
    outputMode: String(value?.outputMode || ''),
    stylePreset: String(value?.stylePreset || ''),
    subtitleFormat: String(value?.subtitleFormat || ''),
    subtitleStylePreset: String(value?.subtitleStylePreset || ''),
    bilingualLayout: String(value?.bilingualLayout || ''),
    chunkSize: Number(value?.chunkSize || 0),
    concurrency: Number(value?.concurrency || 0),
    maxRetries: Number(value?.maxRetries || 0),
    logRetentionDays: Number(value?.logRetentionDays || 0),
    streamUsage: !!value?.streamUsage,
    glossary: value?.glossary || {}
  })
}

const currentSnapshot = computed(() => buildConfigSnapshot(config.value))
const hasUnsavedChanges = computed(() => initialSnapshot.value !== '' && currentSnapshot.value !== initialSnapshot.value)

onMounted(() => {
  const savedMode = localStorage.getItem(MODEL_INPUT_MODE_KEY)
  if (savedMode === 'manual') useManualModelInput.value = true
  if (config.value?.apiKey && config.value?.apiBaseUrl) tryFetchModels()
  initialSnapshot.value = currentSnapshot.value
})

watch(useManualModelInput, (val) => {
  if (!import.meta.client) return
  localStorage.setItem(MODEL_INPUT_MODE_KEY, val ? 'manual' : 'select')
})

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

function handleClose() {
  if (hasUnsavedChanges.value) {
    closeConfirmOpen.value = true
    return
  }
  emit('close')
}

function confirmCloseWithoutSaving() {
  closeConfirmOpen.value = false
  emit('close')
}

async function save() {
  pending.value = true
  try {
    await $fetch('/api/config', { method: 'PUT', body: { ...config.value } })
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
