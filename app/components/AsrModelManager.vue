<template>
  <div class="space-y-3 rounded-2xl border border-gray-200/80 p-3 dark:border-gray-800">
    <div class="flex flex-wrap items-start justify-between gap-2">
      <div class="space-y-1">
        <div class="flex items-center gap-2">
          <p class="text-sm font-medium text-gray-700 dark:text-gray-300">本地模型管理</p>
          <UBadge v-if="meta?.imageMode" color="primary" variant="subtle">镜像内置服务</UBadge>
        </div>
        <p class="text-xs leading-5 text-gray-500 dark:text-gray-400">
          模型不打包进镜像，需要手动开始下载。支持进度、速度、剩余时间、暂停、续传、取消和代理。
        </p>
      </div>
      <UButton label="刷新" icon="i-lucide-refresh-cw" size="xs" color="neutral" variant="ghost" :loading="loading" @click="refresh()" />
    </div>

    <div v-if="effectiveEngine === 'cloud'" class="rounded-xl border border-gray-100 bg-gray-50/70 p-3 text-xs leading-5 text-gray-500 dark:border-gray-800 dark:bg-gray-900/40 dark:text-gray-400">
      当前使用云 ASR，不需要下载本地模型。切换「识别引擎」为自动、faster-whisper 或 whisper.cpp 后可管理本地模型。
    </div>

    <template v-else>
      <div class="grid gap-2 md:grid-cols-[minmax(0,1fr)_auto]">
        <UInput
          v-model="proxy"
          placeholder="下载代理（可选），例如 http://127.0.0.1:7890"
          icon="i-lucide-network"
          class="w-full"
          @change="saveProxy"
        />
        <UButton label="保存代理" size="sm" color="neutral" variant="soft" @click="saveProxy" />
      </div>
      <p class="text-[11px] leading-5 text-gray-500 dark:text-gray-400">
        代理只用于模型下载，保存在浏览器本地，不写入数据库；仅支持 http:// 或 https://。
        <span v-if="meta?.hfEndpoint"> 当前 Hugging Face 地址：{{ meta.hfEndpoint }}。</span>
        <span v-if="meta?.proxyConfigured"> 服务端已配置默认代理。</span>
        <span v-if="meta && meta.autoDownload === false"> 服务端已禁止静默下载，必须手动开始。</span>
      </p>

      <div v-if="errorMessage" class="rounded-xl border border-red-200 bg-red-50 p-3 text-xs leading-5 text-red-700 dark:border-red-900/40 dark:bg-red-950/20 dark:text-red-300">
        {{ errorMessage }}
      </div>

      <div v-else-if="legacyService" class="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-700 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-300">
        当前 ASR 服务是旧版本，只支持基础模型加载。请把主镜像和 sidecar 升级到最新版本后使用完整下载管理。
      </div>

      <div v-if="loading && !rows.length" class="flex items-center gap-2 py-3 text-xs text-gray-500">
        <UIcon name="i-lucide-loader-2" class="h-4 w-4 animate-spin" />
        正在读取模型状态...
      </div>

      <div v-else-if="!rows.length" class="rounded-xl border border-gray-100 bg-gray-50/70 p-3 text-xs leading-5 text-gray-500 dark:border-gray-800 dark:bg-gray-900/40 dark:text-gray-400">
        当前 ASR 服务没有可用的 {{ effectiveEngine }} 模型列表。请检查服务日志或切换识别引擎。
      </div>

      <div v-else class="space-y-2">
        <div v-for="row in rows" :key="row.key" class="rounded-xl border border-gray-100 bg-white p-3 dark:border-gray-800 dark:bg-gray-950/40">
          <div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div class="min-w-0 space-y-1">
              <div class="flex flex-wrap items-center gap-1.5">
                <span class="text-sm font-medium text-gray-700 dark:text-gray-200">{{ row.model }}</span>
                <UBadge v-if="row.model === selectedModel" color="primary" variant="subtle" size="sm">当前选择</UBadge>
                <UBadge v-if="row.installed" color="success" variant="subtle" size="sm">已安装</UBadge>
                <UBadge v-if="row.jobStatus" :color="statusColor(row.jobStatus)" variant="subtle" size="sm">{{ statusLabel(row.jobStatus) }}</UBadge>
              </div>
              <p class="text-[11px] leading-5 text-gray-500 dark:text-gray-400">
                {{ row.engine }}
                <template v-if="row.installed"> · {{ formatBytes(row.installedBytes) }}</template>
                <template v-if="row.job && !row.installed">
                  · {{ formatBytes(row.job.downloaded) }}<template v-if="row.job.total"> / {{ formatBytes(row.job.total) }}</template>
                </template>
              </p>
            </div>
            <div class="flex flex-wrap items-center gap-1.5">
              <UButton v-if="!row.installed && !row.jobActive" :label="row.jobCanResume ? row.jobResumeLabel : '下载'" size="xs" color="primary" variant="soft" :loading="busy === row.key" @click="row.jobCanResume ? resume(row) : start(row)" />
              <UButton v-if="row.jobActive" label="暂停" size="xs" color="neutral" variant="soft" :loading="busy === row.key" @click="pause(row)" />
              <UButton v-if="row.jobCanCancel" label="取消" size="xs" color="error" variant="ghost" :loading="busy === row.key" @click="cancel(row)" />
              <UButton v-if="row.installed" label="卸载" size="xs" color="error" variant="ghost" :loading="busy === row.key" @click="remove(row)" />
              <UButton v-if="row.installed && row.model !== selectedModel" label="使用" size="xs" color="primary" variant="soft" @click="emit('select', row.model)" />
            </div>
          </div>

          <div v-if="row.jobActive || row.jobCanResume || row.jobStatus === 'ready'" class="mt-2 space-y-1">
            <div class="h-2 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
              <div class="h-full rounded-full bg-primary-500 transition-all" :style="{ width: `${row.percent}%` }" />
            </div>
            <div class="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] leading-5 text-gray-500 dark:text-gray-400">
              <span>{{ row.percent }}%</span>
              <span v-if="row.job?.message">{{ row.job.message }}</span>
              <span v-if="row.job?.speed">{{ formatBytes(row.job.speed) }}/s</span>
              <span v-if="row.job?.etaSeconds">剩余 {{ formatDuration(row.job.etaSeconds) }}</span>
              <span v-if="row.job?.filesTotal">文件 {{ row.job.filesDone }}/{{ row.job.filesTotal }}</span>
              <span v-if="row.job?.currentFile" class="truncate">{{ row.job.currentFile }}</span>
            </div>
          </div>

          <p v-if="!row.installed && row.job?.error" class="mt-2 rounded-lg bg-red-50 px-2 py-1 text-[11px] leading-5 text-red-700 dark:bg-red-950/20 dark:text-red-300">
            {{ row.job.error }}
          </p>
        </div>
      </div>

      <p class="text-[11px] leading-5 text-gray-500 dark:text-gray-400">
        建议低配 NAS 选择 <code>small</code>，16GB 以上内存可尝试 <code>medium</code>，Apple Silicon / ARM 可切换到 whisper.cpp。下载中断后重新开始会从断点续传。
      </p>
    </template>
  </div>
</template>

<script setup lang="ts">
const props = defineProps<{
  selectedModel: string
  engine: string
}>()
const emit = defineEmits<{ select: [model: string] }>()

const toast = useToast()
const loading = ref(true)
const busy = ref('')
const errorMessage = ref('')
const meta = ref<any>(null)
const proxy = ref('')
const proxyKey = 'subx:asr-download-proxy'
let timer: ReturnType<typeof setTimeout> | null = null

const effectiveEngine = computed(() => {
  const configured = String(props.engine || 'auto')
  if (configured === 'cloud') return 'cloud'
  if (configured === 'whisper-cpp' || configured === 'faster-whisper') return configured
  return String(meta.value?.resolvedEngine || 'faster-whisper')
})

const jobs = computed<any[]>(() => Array.isArray(meta.value?.jobs) ? meta.value.jobs : [])
const installed = computed<any[]>(() => Array.isArray(meta.value?.installed) ? meta.value.installed : [])
const legacyService = computed(() => !!meta.value && !Array.isArray(meta.value.jobs) && !Array.isArray(meta.value.installed))

function latestJob(model: string, engine: string) {
  return jobs.value
    .filter(job => job.model === model && job.engine === engine)
    .sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0))[0]
}

const rows = computed(() => {
  const engine = effectiveEngine.value
  if (engine === 'cloud') return []
  const available = meta.value?.engines?.[engine]
  const models = Array.isArray(available)
    ? available
    : (engine === 'whisper-cpp' ? [] : (meta.value?.models || []))
  return models.map((model: string) => {
    const install = installed.value.find(item => item.model === model && item.engine === engine)
    const job = latestJob(model, engine)
    const installedFlag = !!install?.installed
    const jobActive = !installedFlag && !!job && ['queued', 'downloading', 'pausing'].includes(String(job.status))
    const jobCanResume = !installedFlag && !!job && ['paused', 'error', 'cancelled'].includes(String(job.status))
    const jobCanCancel = !installedFlag && (jobActive || !!job && ['paused', 'error'].includes(String(job.status)))
    const jobResumeLabel = job?.status === 'paused' ? '继续' : '重试'
    const total = Number(job?.total || 0)
    const downloaded = Number(job?.downloaded || 0)
    const percent = installedFlag ? 100 : (total > 0 ? Math.min(100, Math.round(downloaded * 100 / total)) : (job?.status === 'ready' ? 100 : 0))
    return {
      key: `${engine}:${model}`,
      model,
      engine,
      installed: installedFlag,
      installedBytes: Number(install?.bytes || 0),
      job,
      jobStatus: installedFlag ? '' : String(job?.status || ''),
      jobActive,
      jobCanResume,
      jobCanCancel,
      jobResumeLabel,
      percent
    }
  })
})

function formatBytes(value: number) {
  const bytes = Number(value || 0)
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let size = bytes
  let index = 0
  while (size >= 1024 && index < units.length - 1) {
    size /= 1024
    index++
  }
  return `${size >= 100 ? size.toFixed(0) : size.toFixed(1)} ${units[index]}`
}

function formatDuration(seconds: number) {
  const value = Math.max(0, Math.round(Number(seconds || 0)))
  if (value < 60) return `${value} 秒`
  if (value < 3600) return `${Math.floor(value / 60)} 分 ${value % 60} 秒`
  return `${Math.floor(value / 3600)} 小时 ${Math.floor((value % 3600) / 60)} 分`
}

function statusLabel(status: string) {
  const labels: Record<string, string> = {
    queued: '排队中',
    downloading: '下载中',
    pausing: '正在暂停',
    paused: '已暂停',
    error: '失败',
    cancelled: '已取消',
    ready: '已就绪'
  }
  return labels[status] || status
}

function statusColor(status: string) {
  if (status === 'ready') return 'success'
  if (status === 'error') return 'error'
  if (status === 'paused' || status === 'cancelled') return 'warning'
  return 'primary'
}

function saveProxy() {
  if (!import.meta.client) return
  localStorage.setItem(proxyKey, proxy.value.trim())
  toast.add({ title: '代理已保存', description: proxy.value.trim() ? '下一次下载或续传时生效' : '已清除下载代理', color: 'success' })
}

function schedule(nextDelay = 1500) {
  if (timer) clearTimeout(timer)
  if (!import.meta.client) return
  const hasActive = jobs.value.some(job => ['queued', 'downloading', 'pausing'].includes(String(job.status)))
  timer = setTimeout(async () => {
    await refresh(true)
    if (hasActive || rows.value.some((row: any) => row.jobActive)) schedule(nextDelay)
  }, nextDelay)
}

async function refresh(silent = false) {
  if (!silent) loading.value = true
  errorMessage.value = ''
  try {
    meta.value = await $fetch('/api/asr/models')
    if (!meta.value?.imageMode && !meta.value?.models) {
      errorMessage.value = '没有读取到模型列表，请确认 ASR 服务是否正常。'
    }
  } catch (e: any) {
    errorMessage.value = e?.data?.message || e?.message || '无法连接 ASR 服务'
  } finally {
    if (!silent) loading.value = false
  }
  const hasActive = jobs.value.some(job => ['queued', 'downloading', 'pausing'].includes(String(job.status)))
  if (hasActive) schedule()
}

async function start(row: any) {
  busy.value = row.key
  try {
    const result: any = await $fetch('/api/asr/models-download', {
      method: 'POST',
      body: { model: row.model, engine: row.engine, proxy: proxy.value.trim() }
    })
    if (result?.alreadyInstalled) {
      toast.add({ title: '模型已安装', description: row.model, color: 'success' })
    } else if (result?.jobId) {
      toast.add({ title: '已开始下载', description: `${row.model} · ${row.engine}`, color: 'success' })
    }
    await refresh()
    schedule(800)
  } catch (e: any) {
    toast.add({ title: '下载启动失败', description: e?.data?.message || e?.message || '请检查 ASR 服务', color: 'error' })
  } finally {
    busy.value = ''
  }
}

async function pause(row: any) {
  if (!row.job?.jobId) return
  busy.value = row.key
  try {
    await $fetch('/api/asr/models-download-pause', { method: 'POST', body: { jobId: row.job.jobId } })
    await refresh()
  } catch (e: any) {
    toast.add({ title: '暂停失败', description: e?.data?.message || e?.message, color: 'error' })
  } finally {
    busy.value = ''
  }
}

async function resume(row: any) {
  if (!row.job?.jobId) return
  busy.value = row.key
  try {
    await $fetch('/api/asr/models-download-resume', {
      method: 'POST',
      body: { jobId: row.job.jobId, proxy: proxy.value.trim() }
    })
    await refresh()
    schedule(800)
  } catch (e: any) {
    toast.add({ title: '继续下载失败', description: e?.data?.message || e?.message, color: 'error' })
  } finally {
    busy.value = ''
  }
}

async function cancel(row: any) {
  if (!row.job?.jobId) return
  if (!window.confirm(`取消下载 ${row.model}？已下载的部分会被删除。`)) return
  busy.value = row.key
  try {
    await $fetch('/api/asr/models-download-cancel', { method: 'POST', body: { jobId: row.job.jobId } })
    await refresh()
  } catch (e: any) {
    toast.add({ title: '取消失败', description: e?.data?.message || e?.message, color: 'error' })
  } finally {
    busy.value = ''
  }
}

async function remove(row: any) {
  if (!window.confirm(`卸载模型 ${row.model}？磁盘上的模型文件会被删除。`)) return
  busy.value = row.key
  try {
    await $fetch('/api/asr/models-delete', {
      method: 'POST',
      body: { model: row.model, engine: row.engine }
    })
    toast.add({ title: '模型已卸载', description: row.model, color: 'success' })
    await refresh()
  } catch (e: any) {
    toast.add({ title: '卸载失败', description: e?.data?.message || e?.message, color: 'error' })
  } finally {
    busy.value = ''
  }
}

onMounted(() => {
  if (import.meta.client) proxy.value = localStorage.getItem(proxyKey) || ''
  refresh()
})

onBeforeUnmount(() => {
  if (timer) clearTimeout(timer)
})

watch(() => props.engine, () => {
  refresh()
})
</script>
