<template>
  <AppContainer size="wide" class="space-y-6">
    <PageHeader
      title="翻译历史"
      description="查看任务结果、失败原因与历史日志，进入详情后可继续、核对或重新翻译。"
      :breadcrumb="[{ label: '首页', icon: 'i-lucide-home', to: '/' }, { label: '历史', icon: 'i-lucide-history' }]"
    />

    <div class="app-toolbar-card">
      <div class="app-toolbar-row">
        <UInput v-model="searchQuery" icon="i-lucide-search" size="sm" placeholder="搜索文件路径" class="w-full sm:w-64" aria-label="搜索文件路径" />
        <USelect v-model="statusFilter" :items="statusOptions" size="sm" class="w-full sm:w-32" aria-label="状态筛选" />
        <span class="app-pill app-pill-neutral whitespace-nowrap">共 {{ data?.total || 0 }} 条</span>
      </div>
      <div class="app-toolbar-row">
        <UButton v-if="searchQuery || statusFilter !== 'all'" label="清空筛选" icon="i-lucide-filter-x" size="sm" color="neutral" variant="ghost" @click="clearFilters" />
        <UButton label="清空历史" icon="i-lucide-trash-2" size="sm" color="error" variant="ghost" @click="isClearModalOpen = true" />
      </div>
    </div>

    <div class="surface-card overflow-hidden">
      <div class="history-table hidden p-2 lg:block" style="animation: panel-fade 360ms ease-out both; animation-delay: 80ms;">
        <UTable :data="tasks" :columns="columns" :loading="pending" :ui="{ table: 'w-full table-fixed', td: 'align-middle', th: 'whitespace-nowrap', tr: 'group cursor-default transition-colors duration-150 hover:bg-primary-50/60 dark:hover:bg-primary-950/20' }">
        <template #filePath-cell="{ row }">
          <div class="min-w-0 max-w-[460px] lg:max-w-[560px] xl:max-w-[680px]">
            <div class="flex items-center gap-2">
              <p class="break-all text-sm font-medium text-gray-800 transition-colors group-hover:text-primary-700 dark:text-gray-100 dark:group-hover:text-primary-300">{{ fileName(row.original.filePath) }}</p>
              <UButton
                icon="i-lucide-copy"
                size="xs"
                color="neutral"
                variant="ghost"
                class="shrink-0 opacity-70 hover:opacity-100"
                title="复制完整路径"
                aria-label="复制完整路径"
                @click="copyPath(row.original.filePath)"
              />
            </div>
            <div class="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
              <span class="app-pill" :class="outputModePillClass(row.original.outputMode)">{{ outputModeLabel(row.original.outputMode) }}</span>
              <span class="app-pill app-pill-neutral">{{ subtitleFormatLabel(row.original.subtitleFormat || row.original.subtitle_format) }}</span>
              <span class="whitespace-nowrap">{{ targetLanguageLabel(row.original.targetLanguage) }}</span>
            </div>
          </div>
        </template>

        <template #status-cell="{ row }">
          <AppStatusBadge :status="statusBadgeStatus(row.original)" :label="statusBadgeLabel(row.original)" />
        </template>

        <template #progress-cell="{ row }">
          <div class="min-w-[88px] whitespace-nowrap">
            <span class="text-sm font-medium tabular-nums text-gray-700 dark:text-gray-300">{{ isActiveStatus(row.original.status) || row.original.status === 'paused' || row.original.pauseRequested ? `${row.original.progress}%` : row.original.status === 'review' ? '待核对' : '—' }}</span>
            <p v-if="(isActiveStatus(row.original.status) || row.original.status === 'paused' || row.original.pauseRequested) && row.original.stepMessage" class="mt-0.5 max-w-[180px] truncate text-xs font-normal text-gray-400 dark:text-gray-500">{{ row.original.stepMessage }}</p>
          </div>
        </template>

        <template #createdAt-cell="{ row }">
          <div class="min-w-[132px] text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">{{ formatDate(row.original.createdAt) }}</div>
        </template>

        <template #actions-cell="{ row }">
          <div class="flex items-center justify-center gap-1">
            <div class="inline-flex items-center gap-0.5 rounded-lg border border-gray-100 bg-gray-50/70 p-0.5 dark:border-gray-800 dark:bg-gray-900/40">
              <UButton icon="i-lucide-eye" variant="ghost" color="neutral" size="xs" title="查看详情" aria-label="查看详情" :to="`/task/${row.original.taskId}`" />
              <UButton
                v-if="row.original.reviewAvailable"
                icon="i-lucide-list-checks"
                variant="ghost"
                color="primary"
                size="xs"
                title="进入核对"
                aria-label="进入核对"
                @click="openReview(row.original.taskId)"
              />
              <UButton
                v-if="row.original.status === 'paused' && !row.original.pauseRequested"
                icon="i-lucide-play"
                variant="ghost"
                color="primary"
                size="xs"
                :loading="resumingTaskId === row.original.taskId"
                title="继续任务"
                aria-label="继续任务"
                @click="resumeTask(row.original.taskId)"
              />
              <UButton
                v-if="['error', 'cancelled', 'review', 'done'].includes(row.original.status)"
                icon="i-lucide-refresh-cw"
                variant="ghost"
                color="warning"
                size="xs"
                :loading="retryingTaskId === row.original.taskId"
                title="重新翻译"
                aria-label="重新翻译"
                @click="retryTask(row.original.taskId)"
              />
            </div>
            <UDropdownMenu v-if="rowActionItems(row.original).length" :items="rowActionItems(row.original)" size="sm">
              <UButton icon="i-lucide-ellipsis" variant="ghost" color="neutral" size="xs" title="更多操作" aria-label="更多操作" />
            </UDropdownMenu>
          </div>
        </template>
        <template #empty>
          <div class="app-caption py-10 text-center">当前筛选下暂无任务</div>
        </template>
      </UTable>
      </div>

      <div class="divide-y divide-gray-100 dark:divide-gray-800 lg:hidden">
        <div v-if="pending" class="p-4 text-sm text-gray-500 dark:text-gray-400">
          正在加载任务...
        </div>
        <div v-else-if="!tasks.length" class="p-8 text-center">
          <UIcon name="i-lucide-history" class="mx-auto h-7 w-7 text-gray-300 dark:text-gray-600" />
          <p class="app-caption mt-2">当前筛选下暂无任务</p>
        </div>
        <article v-for="task in tasks" :key="task.taskId" class="p-3 transition-colors hover:bg-gray-50/70 dark:hover:bg-gray-900/30 sm:p-4">
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0">
              <p class="break-all text-sm font-semibold text-gray-900 dark:text-white">{{ fileName(task.filePath) }}</p>
              <p class="app-meta mt-1">{{ task.rootName || '默认媒体库' }} · {{ formatDate(task.createdAt) }}</p>
              <div class="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
                <span class="app-pill" :class="outputModePillClass(task.outputMode)">{{ outputModeLabel(task.outputMode) }}</span>
                <span class="app-pill app-pill-neutral">{{ subtitleFormatLabel(task.subtitleFormat || task.subtitle_format) }}</span>
                <span>{{ targetLanguageLabel(task.targetLanguage) }}</span>
              </div>
              <p v-if="task.content_title" class="mt-1 line-clamp-1 text-xs text-primary-700 dark:text-primary-400">{{ task.content_title }}</p>
            </div>
            <AppStatusBadge :status="statusBadgeStatus(task)" :label="statusBadgeLabel(task)" class="shrink-0" />
          </div>

          <div v-if="isActiveStatus(task.status) || task.status === 'paused' || task.pauseRequested" class="mt-3 space-y-1.5">
            <div class="flex items-center justify-between gap-3 text-xs text-gray-500 dark:text-gray-400">
              <span class="min-w-0 truncate">{{ task.stepMessage || '处理进度' }}</span>
              <span class="shrink-0 font-medium tabular-nums text-gray-700 dark:text-gray-300">{{ task.progress }}%</span>
            </div>
            <div class="h-1.5 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
              <div class="h-full rounded-full bg-primary-500 transition-all" :style="{ width: `${task.progress}%` }" />
            </div>
          </div>
          <p v-else-if="task.status === 'review'" class="app-meta mt-2 font-medium text-warning-600 dark:text-warning-400">等待人工核对</p>
          <p v-else-if="task.error" class="mt-2 line-clamp-2 text-xs text-error-600 dark:text-error-400">{{ task.error }}</p>

          <div class="mt-3 flex flex-wrap items-center gap-1.5 border-t border-gray-100 pt-3 dark:border-gray-800">
            <UButton label="详情" icon="i-lucide-eye" size="xs" color="neutral" variant="soft" :to="`/task/${task.taskId}`" />
            <UButton v-if="task.reviewAvailable" label="核对" icon="i-lucide-list-checks" size="xs" color="warning" variant="soft" @click="openReview(task.taskId)" />
            <UButton v-if="task.status === 'paused' && !task.pauseRequested" label="继续" icon="i-lucide-play" size="xs" color="primary" variant="soft" :loading="resumingTaskId === task.taskId" @click="resumeTask(task.taskId)" />
            <UButton v-if="['error', 'cancelled', 'review', 'done'].includes(task.status)" label="重试" icon="i-lucide-refresh-cw" size="xs" color="neutral" variant="ghost" :loading="retryingTaskId === task.taskId" @click="retryTask(task.taskId)" />
            <UDropdownMenu v-if="rowActionItems(task).length" :items="rowActionItems(task)" size="sm" class="ml-auto">
              <UButton label="更多" icon="i-lucide-ellipsis" size="xs" color="neutral" variant="ghost" title="更多操作" aria-label="更多操作" />
            </UDropdownMenu>
          </div>
        </article>
      </div>

      <div class="flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 px-3 py-2.5 dark:border-gray-800 sm:px-4">
        <p class="app-meta">
          共 {{ data?.total || 0 }} 条，第 {{ page }} / {{ totalPages }} 页
        </p>
        <div class="flex flex-wrap items-center justify-end gap-1.5">
          <USelect v-model="pageSize" :items="pageSizeItems" size="xs" class="w-24" aria-label="每页条数" />
          <UButton label="上一页" size="xs" color="neutral" variant="ghost" :disabled="page <= 1" @click="page -= 1" />
          <UButton
            v-for="pageNumber in pageNumbers"
            :key="pageNumber"
            :label="String(pageNumber)"
            size="xs"
            :color="pageNumber === page ? 'primary' : 'neutral'"
            :variant="pageNumber === page ? 'solid' : 'ghost'"
            @click="page = pageNumber"
          />
          <UButton label="下一页" size="xs" color="neutral" variant="ghost" :disabled="page >= totalPages" @click="page += 1" />
        </div>
      </div>
    </div>

    <OperationsOverviewPanel :task-total="data?.total" />

    <UModal v-model:open="isClearModalOpen" title="确认清空历史记录" description="此操作将永久删除已完成和失败任务及其日志、核对数据，不可撤销；不会清空全局翻译缓存。">
      <template #body>
        <div class="flex items-start gap-4">
          <div class="shrink-0 w-10 h-10 rounded-full bg-error-50 dark:bg-error-500/10 flex items-center justify-center ring-4 ring-error-50/50 dark:ring-error-500/20">
            <UIcon name="i-lucide-alert-triangle" class="w-5 h-5 text-error-600 dark:text-error-400" />
          </div>
          <div class="space-y-1">
            <h3 class="text-sm font-semibold text-gray-900 dark:text-white">确认清空历史？</h3>
            <p class="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">已完成和失败任务及其日志、核对数据将被删除，运行中任务和全局翻译缓存不受影响。</p>
          </div>
        </div>
      </template>
      <template #footer>
        <div class="flex justify-end w-full gap-3">
          <UButton label="取消" color="neutral" variant="ghost" @click="isClearModalOpen = false" />
          <UButton label="确定清空" color="error" variant="solid" :loading="isClearing" @click="clearHistory" />
        </div>
      </template>
    </UModal>
  </AppContainer>
</template>

<script setup>
import { formatDateTime } from '~~/shared/time'

useHead({
  title: '翻译历史 - SubX'
})

const isClearModalOpen = ref(false)
const isClearing = ref(false)
const retryingTaskId = ref('')
const resumingTaskId = ref('')
const deletingTaskId = ref('')
const toast = useToast()
const { confirm } = useConfirm()
const timeZone = useTimeZone()

const page = ref(1)
const pageSize = ref(50)
const pageSizeItems = [
  { label: '20 条/页', value: 20 },
  { label: '50 条/页', value: 50 },
  { label: '100 条/页', value: 100 }
]
const statusFilter = ref('all')
const searchQuery = ref('')
const debouncedSearch = ref('')
let searchDebounceTimer = null
const statusOptions = [
  { label: '全部状态', value: 'all' },
  { label: '完成', value: 'done' },
  { label: '失败', value: 'error' },
  { label: '取消', value: 'cancelled' },
  { label: '待核对', value: 'review' },
  { label: '已暂停', value: 'paused' },
  { label: '翻译中', value: 'translating' },
  { label: '排队中', value: 'queued' }
]
const taskQuery = computed(() => ({
  page: page.value,
  pageSize: pageSize.value,
  status: statusFilter.value === 'all' ? '' : statusFilter.value,
  q: debouncedSearch.value.trim()
}))
const { data, pending, refresh } = await useFetch('/api/tasks', { query: taskQuery })
watch(searchQuery, (value) => {
  if (searchDebounceTimer) clearTimeout(searchDebounceTimer)
  searchDebounceTimer = setTimeout(() => {
    searchDebounceTimer = null
    debouncedSearch.value = value
  }, 250)
})
watch([statusFilter, searchQuery, pageSize], () => { page.value = 1 })
onBeforeUnmount(() => {
  if (searchDebounceTimer) clearTimeout(searchDebounceTimer)
})

const totalPages = computed(() => Math.max(1, Math.ceil(Number(data.value?.total || 0) / pageSize.value)))
const pageNumbers = computed(() => {
  const total = totalPages.value
  if (total <= 7) return Array.from({ length: total }, (_, index) => index + 1)
  const start = Math.max(1, Math.min(page.value - 2, total - 4))
  return Array.from({ length: 5 }, (_, index) => start + index)
})

watch(page, () => {
  if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' })
})

watch(totalPages, (total) => {
  if (page.value > total) page.value = total
})
const tasks = computed(() => data.value?.tasks || [])
const hasActiveTasks = computed(() => tasks.value.some(task => isActiveStatus(task.status)))
let liveRefreshTimer = null

function refreshLiveTasks() {
  if (typeof document === 'undefined') return
  if (document.visibilityState !== 'visible') return
  if (pending.value || !hasActiveTasks.value) return
  void refresh()
}

function startLiveRefresh() {
  if (liveRefreshTimer) return
  liveRefreshTimer = window.setInterval(refreshLiveTasks, 4000)
}

function stopLiveRefresh() {
  if (!liveRefreshTimer) return
  window.clearInterval(liveRefreshTimer)
  liveRefreshTimer = null
}

function handleHistoryVisibilityChange() {
  if (document.visibilityState === 'visible') {
    refreshLiveTasks()
    startLiveRefresh()
  } else {
    stopLiveRefresh()
  }
}

onMounted(() => {
  startLiveRefresh()
  document.addEventListener('visibilitychange', handleHistoryVisibilityChange)
})

onBeforeUnmount(() => {
  stopLiveRefresh()
  document.removeEventListener('visibilitychange', handleHistoryVisibilityChange)
})
async function clearHistory() {
  isClearing.value = true
  try {
    const res = await $fetch('/api/tasks', { method: 'DELETE' })
    toast.add({ title: '清空成功', description: `已清理 ${res.deletedCount} 条任务记录`, color: 'success' })
    isClearModalOpen.value = false
    await refresh()
  } catch {
    toast.add({ title: '清理失败', description: '无法删除历史记录', color: 'error' })
  } finally {
    isClearing.value = false
  }
}

async function retryTask(taskId) {
  if (!(await confirm({
    title: '重新翻译这个任务？',
    description: '将创建新任务并重新调用翻译模型，可能产生额外费用。',
    confirmLabel: '重新翻译',
    color: 'warning'
  }))) return

  retryingTaskId.value = taskId
  try {
    const res = await $fetch('/api/task', { method: 'POST', body: { retryTaskId: taskId } })
    toast.add({ title: '已重试', description: '任务已重新加入队列', color: 'success' })
    if (res?.taskId) {
      navigateTo(`/task/${res.taskId}`)
    } else {
      await refresh()
    }
  } catch (e) {
    toast.add({ title: '重试失败', description: e?.data?.message || '无法重试该任务', color: 'error' })
  } finally {
    retryingTaskId.value = ''
  }
}

async function resumeTask(taskId) {
  resumingTaskId.value = taskId
  try {
    await $fetch(`/api/tasks/${taskId}/resume`, { method: 'POST' })
    toast.add({ title: '已恢复', description: '任务将复用已完成的识别分段继续执行', color: 'success' })
    await refresh()
  } catch (e) {
    toast.add({ title: '恢复失败', description: e?.data?.message || '无法恢复任务', color: 'error' })
  } finally {
    resumingTaskId.value = ''
  }
}

async function deleteTask(taskId) {
  if (!(await confirm({
    title: '删除这条历史记录？',
    description: '任务记录、日志和核对数据会被删除，此操作不可撤销。',
    confirmLabel: '删除记录',
    color: 'error'
  }))) return

  deletingTaskId.value = taskId
  try {
    await $fetch(`/api/tasks/${taskId}`, { method: 'DELETE' })
    toast.add({ title: '删除成功', description: '该条历史记录已删除', color: 'success' })
    await refresh()
  } catch (e) {
    toast.add({ title: '删除失败', description: e?.data?.message || '无法删除该任务', color: 'error' })
  } finally {
    deletingTaskId.value = ''
  }
}

function openReview(taskId) {
  navigateTo(`/review/${taskId}`)
}

function clearFilters() {
  searchQuery.value = ''
  statusFilter.value = 'all'
}

function downloadSubtitle(taskId, format) {
  if (typeof window === 'undefined') return
  window.location.assign(`/api/tasks/${taskId}/download?format=${format}`)
}

function rowActionItems(task) {
  const items = []
  const format = String(task?.subtitle_format || task?.subtitleFormat || 'srt')
  if (task?.status === 'done') {
    if (format !== 'ass') {
      items.push({ label: '下载 SRT', icon: 'i-lucide-file-text', onSelect: () => downloadSubtitle(task.taskId, 'srt') })
    }
    if (format !== 'srt') {
      items.push({ label: '下载 ASS', icon: 'i-lucide-file-code', onSelect: () => downloadSubtitle(task.taskId, 'ass') })
    }
  }
  if (!isActiveStatus(task?.status)) {
    if (items.length) items.push({ type: 'separator' })
    items.push({
      label: '删除记录',
      icon: 'i-lucide-trash-2',
      color: 'error',
      loading: deletingTaskId.value === task?.taskId,
      onSelect: () => deleteTask(task.taskId)
    })
  }
  return items
}

async function copyPath(filePath) {
  try {
    await navigator.clipboard.writeText(String(filePath || ''))
    toast.add({ title: '复制成功', description: '完整路径已复制', color: 'success' })
  } catch {
    toast.add({ title: '复制失败', description: '当前环境不支持复制路径', color: 'error' })
  }
}

function fileName(filePath) {
  const path = String(filePath || '')
  return path.split('/').pop() || path
}

function formatDate(value) {
  return formatDateTime(value, timeZone)
}

function isActiveStatus(status) {
  return ['queued', 'probing', 'extracting', 'extracting_audio', 'transcribing', 'ocr', 'parsing', 'translating', 'exporting'].includes(String(status || ''))
}

function isPausePending(task) {
  return Boolean(task?.pauseRequested) && task?.status !== 'paused'
}

function statusBadgeStatus(task) {
  return isPausePending(task) ? 'paused' : task?.status
}

function statusBadgeLabel(task) {
  return isPausePending(task) ? '暂停中' : undefined
}

const outputModeLabels = {
  translated: '仅译文',
  bilingual: '双语',
  original: '仅原文字幕'
}

const subtitleFormatLabels = {
  srt: 'SRT',
  ass: 'ASS',
  both: 'SRT + ASS'
}

const targetLanguageLabels = {
  'zh-CN': '简体中文',
  'zh-TW': '繁体中文',
  en: '英语',
  ja: '日语',
  ko: '韩语'
}

function outputModeLabel(value) {
  return outputModeLabels[String(value || 'translated')] || value || '仅译文'
}

function outputModePillClass(value) {
  if (value === 'bilingual') return 'app-pill-success'
  if (value === 'original') return 'app-pill-warning'
  return 'app-pill-primary'
}

function subtitleFormatLabel(value) {
  return subtitleFormatLabels[String(value || 'srt')] || value || 'SRT'
}

function targetLanguageLabel(value) {
  return targetLanguageLabels[String(value || '')] || value || '自动'
}

const columns = [
  { accessorKey: 'filePath', header: '文件' },
  { accessorKey: 'status', header: '状态' },
  { accessorKey: 'progress', header: '进度' },
  { accessorKey: 'createdAt', header: '创建时间' },
  { id: 'actions', header: '操作' }
]

</script>

<style scoped>
.history-table :deep(table) {
  table-layout: fixed;
}

.history-table :deep(th:nth-child(2)),
.history-table :deep(td:nth-child(2)) {
  width: 92px;
}

.history-table :deep(th:nth-child(3)),
.history-table :deep(td:nth-child(3)) {
  width: 78px;
}

.history-table :deep(th:nth-child(4)),
.history-table :deep(td:nth-child(4)) {
  width: 148px;
}

.history-table :deep(th:nth-child(5)),
.history-table :deep(td:nth-child(5)) {
  width: 200px;
}
</style>
