<template>
  <div class="space-y-6 max-w-[1500px] mx-auto stagger-fade-in">
    <div class="flex flex-col md:flex-row md:items-end justify-between gap-5 pb-6 mt-8 border-b border-gray-100 dark:border-gray-800">
      <div class="space-y-2">
        <UBreadcrumb :links="[{ label: '首页', icon: 'i-lucide-home', to: '/' }, { label: '历史', icon: 'i-lucide-history' }]" />
        <h2 class="text-3xl font-extrabold tracking-tight text-gray-900 dark:text-white">翻译历史</h2>
        <p class="text-neutral-500 max-w-2xl leading-relaxed">查看任务结果、失败原因与历史日志。</p>
      </div>
      <div class="flex items-center gap-2 md:pb-0.5">
        <UButton label="返回首页" variant="outline" color="neutral" icon="i-lucide-arrow-left" to="/" />
        <UButton label="清空历史" variant="ghost" color="error" icon="i-lucide-trash-2" @click="isClearModalOpen = true" />
      </div>
    </div>

    <details class="group glass-panel rounded-3xl overflow-hidden p-2">
      <summary class="list-none cursor-pointer flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 rounded-[calc(theme(borderRadius.3xl)-0.5rem)] bg-white/85 dark:bg-gray-900/70 px-4 py-4 sm:px-5">
        <div class="space-y-1">
          <div class="flex items-center gap-2 text-gray-900 dark:text-white">
            <UIcon name="i-lucide-chart-no-axes-combined" class="w-4 h-4" />
            <span class="text-sm font-semibold">诊断总览</span>
          </div>
          <p class="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">聚合最近任务的风险标签、响应异常、重试与回退情况，默认折叠，仅在需要排查时展开。</p>
          <p v-if="overviewSummaryText" class="text-[11px] text-gray-600 dark:text-gray-300">{{ overviewSummaryText }}</p>
        </div>
        <div class="flex items-center gap-2 flex-wrap">
          <UBadge color="neutral" variant="subtle">最近 {{ diagnosticsOverview?.summary?.totalTasks || 0 }} 个任务</UBadge>
          <UIcon name="i-lucide-chevron-down" class="w-4 h-4 text-gray-400 shrink-0 transition-transform group-open:rotate-180" />
        </div>
      </summary>

      <div class="px-4 pb-4 sm:px-5 sm:pb-5 space-y-4">
        <div v-if="overviewPending" class="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-2">
          <UIcon name="i-lucide-loader-2" class="w-4 h-4 animate-spin" /> 加载诊断总览中...
        </div>
        <div v-else-if="diagnosticsOverview" class="space-y-4">
          <div class="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-3">
            <div class="rounded-2xl border border-gray-200/70 dark:border-gray-800 bg-gray-50/80 dark:bg-gray-900/70 px-3 py-3"><p class="text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400">完成</p><p class="mt-1 text-sm font-semibold text-gray-900 dark:text-white">{{ diagnosticsOverview.summary.doneTasks }}</p></div>
            <div class="rounded-2xl border border-gray-200/70 dark:border-gray-800 bg-gray-50/80 dark:bg-gray-900/70 px-3 py-3"><p class="text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400">待核对</p><p class="mt-1 text-sm font-semibold text-gray-900 dark:text-white">{{ diagnosticsOverview.summary.reviewTasks }}</p></div>
            <div class="rounded-2xl border border-gray-200/70 dark:border-gray-800 bg-gray-50/80 dark:bg-gray-900/70 px-3 py-3"><p class="text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400">失败</p><p class="mt-1 text-sm font-semibold text-gray-900 dark:text-white">{{ diagnosticsOverview.summary.errorTasks }}</p></div>
            <div class="rounded-2xl border border-gray-200/70 dark:border-gray-800 bg-gray-50/80 dark:bg-gray-900/70 px-3 py-3"><p class="text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400">取消</p><p class="mt-1 text-sm font-semibold text-gray-900 dark:text-white">{{ diagnosticsOverview.summary.cancelledTasks }}</p></div>
            <div class="rounded-2xl border border-gray-200/70 dark:border-gray-800 bg-gray-50/80 dark:bg-gray-900/70 px-3 py-3"><p class="text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400">缺条块</p><p class="mt-1 text-sm font-semibold text-gray-900 dark:text-white">{{ diagnosticsOverview.translation.missingIdChunks }}</p></div>
            <div class="rounded-2xl border border-gray-200/70 dark:border-gray-800 bg-gray-50/80 dark:bg-gray-900/70 px-3 py-3"><p class="text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400">重试块</p><p class="mt-1 text-sm font-semibold text-gray-900 dark:text-white">{{ diagnosticsOverview.translation.retriedChunks }}</p></div>
            <div class="rounded-2xl border border-gray-200/70 dark:border-gray-800 bg-gray-50/80 dark:bg-gray-900/70 px-3 py-3"><p class="text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400">单条补译</p><p class="mt-1 text-sm font-semibold text-gray-900 dark:text-white">{{ diagnosticsOverview.translation.singleRetriedChunks }}</p></div>
            <div class="rounded-2xl border border-gray-200/70 dark:border-gray-800 bg-gray-50/80 dark:bg-gray-900/70 px-3 py-3"><p class="text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400">回退块</p><p class="mt-1 text-sm font-semibold text-gray-900 dark:text-white">{{ diagnosticsOverview.translation.fallbackChunks }}</p></div>
          </div>

          <div class="grid gap-4 xl:grid-cols-3">
            <div class="rounded-2xl border border-gray-200/70 dark:border-gray-800 bg-gray-50/80 dark:bg-gray-900/70 p-4 space-y-2">
              <p class="text-xs font-semibold text-gray-900 dark:text-white">高风险标签</p>
              <div class="flex flex-wrap gap-2">
                <UBadge v-for="risk in diagnosticsOverview.riskTags.slice(0, 8)" :key="risk.tag" color="primary" variant="soft">{{ riskTagLabel(risk.tag) }} × {{ risk.count }}</UBadge>
                <span v-if="!diagnosticsOverview.riskTags.length" class="text-xs text-gray-500 dark:text-gray-400">暂无</span>
              </div>
            </div>
            <div class="rounded-2xl border border-gray-200/70 dark:border-gray-800 bg-gray-50/80 dark:bg-gray-900/70 p-4 space-y-2">
              <p class="text-xs font-semibold text-gray-900 dark:text-white">响应异常</p>
              <div class="flex flex-wrap gap-2">
                <UBadge v-for="issue in diagnosticsOverview.responseIssues.slice(0, 8)" :key="issue.issue" color="warning" variant="soft">{{ issue.issue }} × {{ issue.count }}</UBadge>
                <span v-if="!diagnosticsOverview.responseIssues.length" class="text-xs text-gray-500 dark:text-gray-400">暂无</span>
              </div>
            </div>
            <div class="rounded-2xl border border-gray-200/70 dark:border-gray-800 bg-gray-50/80 dark:bg-gray-900/70 p-4 space-y-2">
              <p class="text-xs font-semibold text-gray-900 dark:text-white">核对原因</p>
              <div class="flex flex-wrap gap-2">
                <UBadge v-for="reason in diagnosticsOverview.reviewReasons.slice(0, 8)" :key="reason.reason" color="error" variant="soft">{{ reviewReasonLabel(reason.reason) }} × {{ reason.count }}</UBadge>
                <span v-if="!diagnosticsOverview.reviewReasons.length" class="text-xs text-gray-500 dark:text-gray-400">暂无</span>
              </div>
            </div>
          </div>
        </div>
        <div v-else class="text-xs text-gray-500 dark:text-gray-400">暂无诊断总览数据。</div>
      </div>
    </details>

    <div class="history-table glass-panel rounded-3xl overflow-hidden p-2" style="animation: panel-fade 360ms ease-out both; animation-delay: 80ms;">
      <UTable :data="tasks" :columns="columns" :loading="pending" :ui="{ table: 'w-full table-fixed', td: 'align-middle', th: 'whitespace-nowrap', tr: 'group' }">
        <template #filePath-cell="{ row }">
          <div class="min-w-0 max-w-[460px] lg:max-w-[560px] xl:max-w-[680px]">
            <div class="flex items-start gap-2">
              <div class="min-w-0 flex-1 space-y-1">
                <p class="text-sm font-medium text-gray-800 dark:text-gray-100 break-all">{{ fileName(row.original.filePath) }}</p>
                <div class="flex items-center gap-2 flex-wrap text-[11px] text-gray-500 dark:text-gray-400">
                  <span>{{ row.original.rootName || '默认媒体库' }}</span>
                  <span class="text-[10px] text-gray-300 dark:text-gray-600">•</span>
                  <span class="break-all" :class="isExpanded(row.original.taskId) ? '' : 'line-clamp-1'">{{ row.original.filePath }}</span>
                  <UButton
                    v-if="shouldShowExpand(row.original.filePath)"
                    :label="isExpanded(row.original.taskId) ? '收起路径' : '展开路径'"
                    size="xs"
                    color="neutral"
                    variant="ghost"
                    class="h-5 px-1.5"
                    @click="toggleExpanded(row.original.taskId)"
                  />
                </div>
              </div>
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
          </div>
        </template>

        <template #status-cell="{ row }">
          <UBadge :color="statusColor(row.original.status)" variant="subtle" size="sm" class="capitalize whitespace-nowrap">{{ row.original.status }}</UBadge>
        </template>

        <template #progress-cell="{ row }">
          <div class="min-w-[62px] text-sm text-gray-700 dark:text-gray-300 whitespace-nowrap">
            {{ isActiveStatus(row.original.status) ? `${row.original.progress}%` : row.original.status === 'review' ? '待核对' : '—' }}
          </div>
        </template>

        <template #createdAt-cell="{ row }">
          <div class="min-w-[132px] text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">{{ formatDate(row.original.createdAt) }}</div>
        </template>

        <template #actions-cell="{ row }">
          <div class="w-full min-w-[170px] flex items-center justify-center py-1">
            <div class="inline-flex min-w-[154px] items-center justify-center gap-1 rounded-xl border border-gray-100 dark:border-gray-800 bg-white/90 dark:bg-gray-900/70 px-2 py-1.5 shadow-sm">
              <UButton icon="i-lucide-eye" variant="ghost" color="neutral" size="xs" :to="`/task/${row.original.taskId}`" />
              <UButton
                v-if="['error', 'cancelled', 'review', 'done'].includes(row.original.status)"
                icon="i-lucide-refresh-cw"
                variant="ghost"
                color="warning"
                size="xs"
                :loading="retryingTaskId === row.original.taskId"
                title="重新翻译"
                @click="retryTask(row.original.taskId)"
              />
              <UButton v-if="row.original.status === 'review'" icon="i-lucide-list-checks" variant="ghost" color="primary" size="xs" @click="openReview(row.original.taskId)" />
              <a v-if="row.original.status === 'done'" :href="`/api/tasks/${row.original.taskId}/download`" class="inline-flex items-center justify-center rounded-lg p-1.5 text-primary-500 hover:text-primary-700 dark:hover:text-primary-300 hover:bg-primary-50 dark:hover:bg-primary-900/20 transition-colors">
                <UIcon name="i-lucide-download" class="w-4 h-4" />
              </a>
              <UButton icon="i-lucide-trash-2" variant="ghost" color="error" size="xs" :loading="deletingTaskId === row.original.taskId" @click="deleteTask(row.original.taskId)" />
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
useHead({
  title: '翻译历史 - SubX'
})

const isClearModalOpen = ref(false)
const isClearing = ref(false)
const retryingTaskId = ref('')
const deletingTaskId = ref('')
const expandedTaskIds = ref(new Set())
const toast = useToast()

const { data, pending, refresh } = await useFetch('/api/tasks')
const { data: diagnosticsOverview, pending: overviewPending } = await useFetch('/api/tasks/diagnostics/overview')
const overviewSummaryText = computed(() => {
  const value = diagnosticsOverview.value
  if (!value) return ''
  return [
    `异常响应 ${value.responseIssues.reduce((sum, item) => sum + Number(item.count || 0), 0)} 次`,
    `缺条块 ${value.translation.missingIdChunks} 个`,
    `重试块 ${value.translation.retriedChunks} 个`,
    `回退块 ${value.translation.fallbackChunks} 个`
  ].join(' · ')
})
const tasks = computed(() => data.value?.tasks || [])
const riskTagLabels = {
  non_dialogue: '非对白内容',
  lyrics: '歌词/吟唱',
  formatting_tokens: '格式标记密集',
  repeated_short_lines: '短句重复较多',
  punctuation_heavy: '符号密集',
  speaker_labels: '说话人标签',
  mixed_language: '多语言混杂',
  long_lines: '长句较多'
}

const reviewReasonLabels = {
  missing: '缺少译文',
  same_as_source: '译文与原文相同',
  same_as_source_allowed: '同文可接受',
  latin_heavy: '译文仍偏原语言',
  bilingual_duplicate: '双语内容重复',
  suspected_contamination: '疑似串条/混入相邻字幕',
  overlong_translation: '译文异常偏长'
}

function riskTagLabel(tag) {
  return riskTagLabels[tag] || tag
}

function reviewReasonLabel(reason) {
  return reviewReasonLabels[reason] || reason
}


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

async function deleteTask(taskId) {
  if (!window.confirm('确认删除这条历史记录吗？此操作不可撤销。')) return

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
  navigateTo(`/task/${taskId}/review`)
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
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  })
}

function isActiveStatus(status) {
  return ['queued', 'extracting', 'parsing', 'translating', 'exporting'].includes(String(status || ''))
}

const columns = [
  { accessorKey: 'filePath', header: '文件' },
  { accessorKey: 'status', header: '状态' },
  { accessorKey: 'progress', header: '进度' },
  { accessorKey: 'createdAt', header: '创建时间' },
  { id: 'actions', header: '操作' }
]

function statusColor(status) {
  switch (status) {
    case 'done': return 'success'
    case 'cancelled': return 'warning'
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
</style>
