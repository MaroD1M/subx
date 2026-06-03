<template>
  <div class="space-y-6 max-w-[1500px] mx-auto stagger-fade-in">
    <div class="flex flex-col md:flex-row md:items-end justify-between gap-5 pb-6 mt-8 border-b border-gray-100 dark:border-gray-800">
      <div class="space-y-2">
        <UBreadcrumb :links="[{ label: '首页', icon: 'i-lucide-home', to: '/' }, { label: '历史', icon: 'i-lucide-history' }]" />
        <h2 class="text-3xl font-extrabold tracking-tight text-gray-900 dark:text-white">翻译历史</h2>
        <p class="text-neutral-500 max-w-2xl leading-relaxed">查看任务结果与历史记录。</p>
      </div>
      <div class="flex items-center gap-2 md:pb-0.5">
        <UButton label="返回首页" variant="outline" color="neutral" icon="i-lucide-arrow-left" to="/" />
        <UButton label="清空历史" variant="ghost" color="error" icon="i-lucide-trash-2" @click="isClearModalOpen = true" />
      </div>
    </div>

    <div class="history-table glass-panel rounded-3xl overflow-hidden p-2" style="animation: panel-fade 360ms ease-out both; animation-delay: 80ms;">
      <UTable :data="tasks" :columns="columns" :loading="pending" :ui="{ table: 'w-full table-fixed', td: 'align-top', th: 'whitespace-nowrap', tr: 'group' }">
        <template #filePath-cell="{ row }">
          <div class="min-w-0 max-w-[460px] lg:max-w-[560px] xl:max-w-[680px]">
            <div class="min-w-0">
              <div class="flex items-start gap-2">
                <p class="min-w-0 flex-1 text-sm font-medium text-gray-800 dark:text-gray-100 break-all" :class="isExpanded(row.original.taskId) ? '' : 'line-clamp-2'">
                  {{ row.original.filePath }}
                </p>
                <UButton
                  icon="i-lucide-copy"
                  size="xs"
                  color="neutral"
                  variant="ghost"
                  class="shrink-0 opacity-70 hover:opacity-100"
                  title="复制完整路径"
                  @click="copyPath(row.original.filePath)"
                />
              </div>
              <div class="mt-1 flex items-center gap-2 flex-wrap">
                <p class="text-[11px] text-gray-500 dark:text-gray-400">{{ row.original.rootName || '默认媒体库' }}</p>
                <span class="text-[10px] text-gray-300 dark:text-gray-600">•</span>
                <p class="text-[11px] text-gray-400 dark:text-gray-500 break-all">{{ fileName(row.original.filePath) }}</p>
                <UButton
                  v-if="shouldShowExpand(row.original.filePath)"
                  :label="isExpanded(row.original.taskId) ? '收起' : '展开'"
                  size="xs"
                  color="neutral"
                  variant="ghost"
                  class="h-5 px-1.5"
                  @click="toggleExpanded(row.original.taskId)"
                />
              </div>
            </div>
          </div>
        </template>

        <template #status-cell="{ row }">
          <UBadge :color="statusColor(row.original.status)" variant="subtle" size="sm" class="capitalize whitespace-nowrap">{{ row.original.status }}</UBadge>
        </template>

        <template #progress-cell="{ row }">
          <div class="min-w-[62px] text-sm text-gray-700 dark:text-gray-300 whitespace-nowrap">{{ row.original.progress }}%</div>
        </template>

        <template #createdAt-cell="{ row }">
          <div class="min-w-[132px] text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">{{ formatDate(row.original.createdAt) }}</div>
        </template>

        <template #actions-cell="{ row }">
          <div class="w-full flex items-center justify-center py-1">
            <div class="inline-flex items-center justify-center gap-1.5 rounded-xl border border-gray-100 dark:border-gray-800 bg-white/80 dark:bg-gray-900/60 px-2 py-1.5 shadow-sm">
              <UButton icon="i-lucide-eye" variant="ghost" color="neutral" size="xs" :to="`/task/${row.original.taskId}`" />
              <UButton v-if="row.original.status === 'error'" icon="i-lucide-rotate-ccw" variant="ghost" color="warning" size="xs" :loading="retryingTaskId === row.original.taskId" @click="retryTask(row.original.taskId)" />
              <a v-if="row.original.status === 'done'" :href="`/api/tasks/${row.original.taskId}/download`" class="inline-flex items-center justify-center rounded-lg p-1.5 text-primary-500 hover:text-primary-700 dark:hover:text-primary-300 hover:bg-primary-50 dark:hover:bg-primary-900/20 transition-colors">
                <UIcon name="i-lucide-download" class="w-4 h-4" />
              </a>
            </div>
          </div>
        </template>
      </UTable>
    </div>

    <UModal v-model:open="isClearModalOpen" title="确认清空历史记录" description="此操作将永久删除所有已完成和失败的任务，不可撤销。">
      <template #body>
        <div class="flex items-start gap-4">
          <div class="shrink-0 w-10 h-10 rounded-full bg-error-50 dark:bg-error-500/10 flex items-center justify-center ring-4 ring-error-50/50 dark:ring-error-500/20">
            <UIcon name="i-lucide-alert-triangle" class="w-5 h-5 text-error-600 dark:text-error-400" />
          </div>
          <div class="space-y-1">
            <h3 class="text-sm font-semibold text-gray-900 dark:text-white">确认清空历史？</h3>
            <p class="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">已完成和失败任务将被删除，运行中任务不受影响。</p>
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
  </div>
</template>

<script setup>
const isClearModalOpen = ref(false)
const isClearing = ref(false)
const retryingTaskId = ref('')
const expandedTaskIds = ref(new Set())
const toast = useToast()

const { data, pending, refresh } = await useFetch('/api/tasks')
const tasks = computed(() => data.value?.tasks || [])

async function clearHistory() {
  isClearing.value = true
  try {
    const res = await $fetch('/api/tasks', { method: 'DELETE' })
    toast.add({ title: '清理成功', description: `已清理 ${res.deletedCount} 条任务记录`, color: 'success' })
    isClearModalOpen.value = false
    await refresh()
  } catch {
    toast.add({ title: '清理失败', description: '无法删除历史记录', color: 'error' })
  } finally {
    isClearing.value = false
  }
}

async function retryTask(taskId) {
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

function shouldShowExpand(filePath) {
  return String(filePath || '').length > 72
}

function isExpanded(taskId) {
  return expandedTaskIds.value.has(taskId)
}

function toggleExpanded(taskId) {
  const next = new Set(expandedTaskIds.value)
  if (next.has(taskId)) next.delete(taskId)
  else next.add(taskId)
  expandedTaskIds.value = next
}

async function copyPath(filePath) {
  try {
    await navigator.clipboard.writeText(String(filePath || ''))
    toast.add({ title: '复制成功', description: '完整路径已复制到剪贴板', color: 'success' })
  } catch {
    toast.add({ title: '复制失败', description: '当前环境不支持复制路径', color: 'error' })
  }
}

function fileName(filePath) {
  const path = String(filePath || '')
  return path.split('/').pop() || path
}

function formatDate(value) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })
}

const columns = [
  { accessorKey: 'filePath', header: '文件路径' },
  { accessorKey: 'status', header: '状态' },
  { accessorKey: 'progress', header: '进度' },
  { accessorKey: 'createdAt', header: '创建时间' },
  { id: 'actions', header: '操作' }
]

function statusColor(status) {
  switch (status) {
    case 'done': return 'success'
    case 'error': return 'error'
    case 'translating': return 'primary'
    default: return 'neutral'
  }
}
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

.history-table :deep(th:last-child),
.history-table :deep(td:last-child) {
  width: 132px;
  text-align: center;
}

.history-table :deep(th:last-child > div),
.history-table :deep(td:last-child > div) {
  justify-content: center;
}

.history-table :deep(td:last-child) {
  vertical-align: middle;
}
</style>
