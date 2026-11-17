<template>
  <AppContainer size="wide" class="space-y-6">
    <PageHeader
      title="翻译历史"
      description="查看任务状态与结果，进入详情继续、核对或重试。"
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

    <div v-if="showQueuePanel" class="surface-card overflow-hidden">
      <div class="flex flex-wrap items-center gap-2 px-3 py-2.5">
        <button
          type="button"
          class="flex min-w-0 flex-1 items-center gap-2 rounded-lg text-left focus-ring"
          :aria-expanded="queueExpanded"
          aria-controls="history-queue-content"
          @click="queueExpanded = !queueExpanded"
        >
          <UIcon name="i-lucide-activity" class="h-4 w-4 shrink-0" :class="queueControl?.paused ? 'text-amber-500' : 'text-primary-600 dark:text-primary-400'" />
          <span class="shrink-0 text-sm font-medium">{{ queueControl?.paused ? '队列已暂停' : '任务队列' }}</span>
          <span class="flex min-w-0 flex-wrap items-center gap-1.5">
            <span v-if="queueJobs?.running" class="app-pill app-pill-primary">运行 {{ queueJobs.running }}</span>
            <span v-if="queueJobs?.queued" class="app-pill app-pill-info">等待 {{ queueJobs.queued }}</span>
            <span v-if="queueJobs?.paused" class="app-pill app-pill-warning">暂停 {{ queueJobs.paused }}</span>
            <span v-if="activeBatches.length" class="app-pill app-pill-neutral">批次 {{ activeBatches.length }}</span>
          </span>
          <UIcon name="i-lucide-chevron-down" class="ml-auto h-4 w-4 shrink-0 text-gray-400 transition-transform" :class="{ 'rotate-180': queueExpanded }" />
        </button>
        <UButton
          :label="queueControl?.paused ? '恢复队列' : '暂停队列'"
          :icon="queueControl?.paused ? 'i-lucide-play' : 'i-lucide-pause'"
          size="xs"
          :color="queueControl?.paused ? 'primary' : 'warning'"
          variant="soft"
          :loading="queueUpdating"
          @click="setQueuePaused(!queueControl?.paused)"
        />
      </div>

      <div v-if="queueExpanded" id="history-queue-content" class="border-t border-gray-100 dark:border-gray-800">
        <div v-if="!queueSections.length && !activeBatches.length" class="px-3 py-6 text-center">
          <UIcon name="i-lucide-list-checks" class="mx-auto h-6 w-6 text-gray-300 dark:text-gray-600" />
          <p class="app-caption mt-2">当前没有运行中或等待中的任务</p>
        </div>

        <section v-for="section in queueSections" :key="section.key">
          <div class="flex items-center gap-2 border-b border-gray-100 bg-gray-50/70 px-3 py-1.5 dark:border-gray-800 dark:bg-gray-900/35">
            <UIcon :name="section.icon" class="h-3.5 w-3.5 text-gray-500 dark:text-gray-400" />
            <span class="text-xs font-semibold text-gray-600 dark:text-gray-300">{{ section.label }}</span>
            <span class="app-meta">{{ section.tasks.length }}</span>
            <span v-if="section.key === 'waiting'" class="app-meta ml-auto">按优先级从高到低</span>
          </div>
          <div class="divide-y divide-gray-100 dark:divide-gray-800">
            <div v-for="task in section.tasks" :key="task.taskId" class="flex flex-col gap-2 px-3 py-2.5 sm:flex-row sm:items-start sm:gap-3">
              <div class="flex min-w-0 flex-1 items-start gap-2.5">
                <span v-if="section.key === 'waiting'" class="mt-0.5 w-7 shrink-0 text-center text-xs font-semibold tabular-nums text-gray-500 dark:text-gray-400">{{ '#' + waitingPositions.get(task.taskId) }}</span>
                <UIcon v-else :name="section.key === 'running' ? 'i-lucide-loader-2' : 'i-lucide-pause'" class="mt-0.5 h-4 w-4 shrink-0" :class="section.key === 'running' ? 'animate-spin text-sky-500' : 'text-amber-500'" />

                <div class="min-w-0 flex-1 space-y-1">
                  <div class="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <p class="min-w-0 break-all text-sm font-medium text-gray-800 dark:text-gray-100">{{ fileName(task.filePath) }}</p>
                    <AppStatusBadge :status="statusBadgeStatus(task)" :label="statusBadgeLabel(task)" />
                    <span class="app-pill app-pill-neutral tabular-nums" title="队列优先级">P{{ task.priority }}</span>
                    <span class="app-meta">{{ targetLanguageLabel(task.targetLanguage) }}</span>
                    <span v-if="task.batchName" class="app-meta truncate">{{ task.batchName }}</span>
                  </div>
                  <p v-if="task.stepMessage" class="app-meta break-all">{{ task.stepMessage }}</p>
                  <div v-if="section.key !== 'waiting' || task.pauseRequested" class="flex items-center gap-2">
                    <div class="h-1.5 min-w-24 flex-1 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
                      <div class="h-full rounded-full bg-primary-500 transition-all" :style="{ width: `${Math.max(0, Math.min(100, Number(task.progress) || 0))}%` }" />
                    </div>
                    <span class="app-meta shrink-0 tabular-nums">{{ task.progress }}%</span>
                  </div>
                  <p v-else-if="task.scheduledAt" class="app-meta">计划 {{ formatDate(task.scheduledAt) }}</p>
                </div>
              </div>

              <div class="flex shrink-0 items-center gap-1 pl-9 sm:pl-0">
                <div v-if="canChangeQueuePriority(task)" class="inline-flex items-center gap-0.5 rounded-lg border border-gray-100 bg-gray-50/70 p-0.5 dark:border-gray-800 dark:bg-gray-900/40">
                  <UButton
                    icon="i-lucide-arrow-up"
                    variant="ghost"
                    color="neutral"
                    size="xs"
                    :loading="queueActionId === task.taskId"
                    :aria-label="`提高优先级 ${fileName(task.filePath)}`"
                    title="提高优先级"
                    @click="changePriority(task, 10)"
                  />
                  <UButton
                    icon="i-lucide-arrow-down"
                    variant="ghost"
                    color="neutral"
                    size="xs"
                    :loading="queueActionId === task.taskId"
                    :aria-label="`降低优先级 ${fileName(task.filePath)}`"
                    title="降低优先级"
                    @click="changePriority(task, -10)"
                  />
                </div>
                <UButton
                  v-if="canPauseQueue(task)"
                  icon="i-lucide-pause"
                  variant="soft"
                  color="warning"
                  size="xs"
                  :loading="queueActionId === task.taskId"
                  :aria-label="`暂停 ${fileName(task.filePath)}`"
                  title="暂停任务"
                  @click="pauseTask(task.taskId)"
                />
                <UButton
                  v-if="task.status === 'paused' && !task.pauseRequested"
                  icon="i-lucide-play"
                  variant="soft"
                  color="primary"
                  size="xs"
                  :loading="resumingTaskId === task.taskId"
                  :aria-label="`继续 ${fileName(task.filePath)}`"
                  title="继续任务"
                  @click="resumeTask(task.taskId)"
                />
                <UButton icon="i-lucide-eye" variant="ghost" color="neutral" size="xs" title="查看详情" aria-label="查看详情" :to="`/task/${task.taskId}`" />
              </div>
            </div>
          </div>
        </section>

        <div v-if="queueData?.tasksTruncated" class="border-t border-gray-100 px-3 py-2 dark:border-gray-800">
          <p class="app-meta">任务较多，当前只展示前 200 个队列任务。</p>
        </div>

        <div v-if="activeBatches.length" class="border-t border-gray-100 dark:border-gray-800">
          <div class="flex items-center gap-2 border-b border-gray-100 bg-gray-50/70 px-3 py-1.5 dark:border-gray-800 dark:bg-gray-900/35">
            <UIcon name="i-lucide-layers" class="h-3.5 w-3.5 text-gray-500 dark:text-gray-400" />
            <span class="text-xs font-semibold text-gray-600 dark:text-gray-300">批次</span>
            <span class="app-meta">{{ activeBatches.length }}</span>
          </div>
          <div class="space-y-1.5 p-3">
            <div v-for="batch in activeBatches" :key="batch.id" class="rounded-lg bg-gray-50/70 px-2.5 py-2 dark:bg-gray-900/40">
              <div class="flex flex-wrap items-center gap-2">
                <span class="min-w-0 flex-1 truncate text-sm font-medium">{{ batch.name || '未命名批次' }}</span>
                <span v-if="batch.priority" class="app-meta whitespace-nowrap" title="优先级">P{{ batch.priority }}</span>
                <span class="app-pill" :class="batchStatusClass(batch.status)">{{ batchStatusLabel(batch.status) }}</span>
                <span class="app-meta whitespace-nowrap tabular-nums">{{ batch.completedCount }}/{{ batch.taskCount }}<template v-if="batch.failedCount"> · 失败 {{ batch.failedCount }}</template></span>
                <span v-if="batch.scheduledAt && batch.status === 'scheduled'" class="app-meta whitespace-nowrap">{{ formatDate(batch.scheduledAt) }}</span>
                <div class="flex shrink-0 items-center">
                  <UButton v-if="batch.status === 'paused'" icon="i-lucide-play" size="xs" color="primary" variant="ghost" :loading="batchActionId === batch.id" aria-label="恢复批次" title="恢复批次" @click="resumeBatch(batch.id)" />
                  <UButton v-else-if="['queued', 'scheduled', 'running'].includes(batch.status)" icon="i-lucide-pause" size="xs" color="warning" variant="ghost" :loading="batchActionId === batch.id" aria-label="暂停批次" title="暂停批次" @click="pauseBatch(batch.id)" />
                  <UButton v-if="batch.failedCount" icon="i-lucide-refresh-cw" size="xs" color="warning" variant="ghost" :loading="batchActionId === batch.id" aria-label="重试失败任务" title="重试失败任务" @click="retryFailedBatch(batch.id)" />
                  <UButton v-if="!['completed', 'failed', 'cancelled'].includes(batch.status)" icon="i-lucide-octagon-x" size="xs" color="error" variant="ghost" :loading="batchActionId === batch.id" aria-label="取消批次" title="取消批次" @click="cancelBatch(batch.id)" />
                </div>
              </div>
              <div class="mt-1.5 h-1 overflow-hidden rounded-full bg-gray-200/70 dark:bg-gray-800">
                <div class="h-full rounded-full bg-primary-500 transition-all" :style="{ width: `${batch.taskCount ? Math.round(batch.completedCount / batch.taskCount * 100) : 0}%` }" />
              </div>
            </div>
          </div>
        </div>
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
              <span v-if="row.original.priority" class="app-meta whitespace-nowrap" title="队列优先级">P{{ row.original.priority }}</span>
            </div>
          </div>
        </template>

        <template #status-cell="{ row }">
          <AppStatusBadge :status="statusBadgeStatus(row.original)" :label="statusBadgeLabel(row.original)" />
        </template>

        <template #progress-cell="{ row }">
          <div class="min-w-[88px] whitespace-nowrap">
            <span class="text-sm font-medium tabular-nums text-gray-700 dark:text-gray-300">{{ isActiveStatus(row.original.status) || row.original.status === 'paused' || row.original.pauseRequested ? `${row.original.progress}%` : row.original.status === 'review' ? '待核对' : '—' }}</span>
            <p v-if="(isActiveStatus(row.original.status) || row.original.status === 'paused' || row.original.pauseRequested) && row.original.stepMessage" class="mt-0.5 max-w-[180px] truncate text-xs font-normal text-gray-500 dark:text-gray-400">{{ row.original.stepMessage }}</p>
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
                v-if="canPauseQueue(row.original)"
                icon="i-lucide-pause"
                variant="ghost"
                color="warning"
                size="xs"
                :loading="queueActionId === row.original.taskId"
                :title="row.original.queueStatus === 'running' ? '暂停任务' : '暂停排队'"
                :aria-label="row.original.queueStatus === 'running' ? '暂停任务' : '暂停排队'"
                @click="pauseTask(row.original.taskId)"
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
                <span v-if="task.priority" class="app-meta whitespace-nowrap" title="队列优先级">P{{ task.priority }}</span>
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
            <UButton v-if="canPauseQueue(task)" label="暂停" icon="i-lucide-pause" size="xs" color="warning" variant="soft" :loading="queueActionId === task.taskId" @click="pauseTask(task.taskId)" />
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
const queueActionId = ref('')
const deletingTaskId = ref('')
const toast = useToast()
const { confirm } = useConfirm()
const timeZone = useTimeZone()

const page = ref(1)
const pageSize = ref(20)
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
  { label: '自动重试', value: 'retrying' },
  { label: '排队中', value: 'queued' }
]
const taskQuery = computed(() => ({
  page: page.value,
  pageSize: pageSize.value,
  status: statusFilter.value === 'all' ? '' : statusFilter.value,
  q: debouncedSearch.value.trim()
}))
const { data, pending, refresh } = await useFetch('/api/tasks', { query: taskQuery })
const { data: queueData, refresh: refreshQueue } = await useFetch('/api/task-queue')
const { data: batchData, refresh: refreshBatches } = await useFetch('/api/task-batches', { query: { limit: 20 } })
const queueControl = computed(() => queueData.value?.control)
const queueJobs = computed(() => queueData.value?.jobs)
const queueUpdating = ref(false)
const queueExpanded = ref(false)
const queueTasks = computed(() => queueData.value?.tasks || [])
const queueRunningTasks = computed(() => queueTasks.value.filter(task => task.queueStatus === 'running'))
const queueWaitingTasks = computed(() => queueTasks.value.filter(task => task.queueStatus === 'queued'))
const queuePausedTasks = computed(() => queueTasks.value.filter(task => task.queueStatus === 'paused'))
const queueSections = computed(() => [
  { key: 'running', label: '运行中', icon: 'i-lucide-activity', tasks: queueRunningTasks.value },
  { key: 'waiting', label: '等待中', icon: 'i-lucide-clock-3', tasks: queueWaitingTasks.value },
  { key: 'paused', label: '已暂停', icon: 'i-lucide-pause', tasks: queuePausedTasks.value }
].filter(section => section.tasks.length > 0))
const waitingPositions = computed(() => new Map(queueWaitingTasks.value.map((task, index) => [task.taskId, index + 1])))
const batchActionId = ref('')
const activeBatches = computed(() => (batchData.value?.batches || []).filter(batch => ['scheduled', 'queued', 'running', 'paused'].includes(String(batch.status))))
const showQueuePanel = computed(() => Boolean(queueControl.value?.paused || activeBatches.value.length || queueTasks.value.length || queueJobs.value?.queued || queueJobs.value?.running))
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
  if (pending.value) return
  if (hasActiveTasks.value || activeBatches.value.length || queueJobs.value?.queued || queueJobs.value?.running) {
    void Promise.all([refresh(), refreshQueue(), refreshBatches()])
  }
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
async function setQueuePaused(paused) {
  queueUpdating.value = true
  try {
    await $fetch(`/api/task-queue/${paused ? 'pause' : 'resume'}`, { method: 'POST' })
    toast.add({ title: paused ? '队列已暂停' : '队列已恢复', description: paused ? '不会领取新任务，运行中的任务继续完成' : '等待中的任务会继续执行', color: 'success' })
    await Promise.all([refreshQueue(), refreshBatches(), refresh()])
  } catch (e) {
    toast.add({ title: '操作失败', description: e?.data?.message || e?.message || '无法更新队列状态', color: 'error' })
  } finally {
    queueUpdating.value = false
  }
}

async function pauseBatch(batchId) {
  batchActionId.value = batchId
  try {
    await $fetch(`/api/task-batches/${batchId}/pause`, { method: 'POST' })
    toast.add({ title: '批次已暂停', description: '运行中的任务会继续完成', color: 'success' })
    await Promise.all([refreshBatches(), refreshQueue(), refresh()])
  } catch (e) {
    toast.add({ title: '暂停失败', description: e?.data?.message || e?.message || '无法暂停批次', color: 'error' })
  } finally {
    batchActionId.value = ''
  }
}

async function resumeBatch(batchId) {
  batchActionId.value = batchId
  try {
    await $fetch(`/api/task-batches/${batchId}/resume`, { method: 'POST' })
    toast.add({ title: '批次已恢复', description: '等待中的任务会继续执行', color: 'success' })
    await Promise.all([refreshBatches(), refreshQueue(), refresh()])
  } catch (e) {
    toast.add({ title: '恢复失败', description: e?.data?.message || e?.message || '无法恢复批次', color: 'error' })
  } finally {
    batchActionId.value = ''
  }
}

async function retryFailedBatch(batchId) {
  batchActionId.value = batchId
  try {
    const res = await $fetch(`/api/task-batches/${batchId}/retry-failed`, { method: 'POST' })
    toast.add({ title: '已重新加入队列', description: `创建了 ${res.taskIds?.length || 0} 个重试任务`, color: 'success' })
    await Promise.all([refreshBatches(), refreshQueue(), refresh()])
  } catch (e) {
    toast.add({ title: '重试失败', description: e?.data?.message || e?.message || '无法重试批次失败任务', color: 'error' })
  } finally {
    batchActionId.value = ''
  }
}

async function cancelBatch(batchId) {
  if (!(await confirm({
    title: '取消这个批次？',
    description: '等待中和暂停中的任务会取消，运行中的任务也会停止；已完成任务不受影响。',
    confirmLabel: '取消批次',
    color: 'error'
  }))) return
  batchActionId.value = batchId
  try {
    await $fetch(`/api/task-batches/${batchId}/cancel`, { method: 'POST' })
    toast.add({ title: '批次已取消', description: '未完成任务已停止', color: 'success' })
    await Promise.all([refreshBatches(), refreshQueue(), refresh()])
  } catch (e) {
    toast.add({ title: '取消失败', description: e?.data?.message || e?.message || '无法取消批次', color: 'error' })
  } finally {
    batchActionId.value = ''
  }
}

function batchStatusLabel(status) {
  return {
    draft: '草稿',
    scheduled: '已计划',
    queued: '排队中',
    running: '运行中',
    paused: '已暂停',
    completed: '已完成',
    failed: '失败',
    cancelled: '已取消'
  }[String(status || '')] || String(status || '-')
}

function batchStatusClass(status) {
  if (status === 'running') return 'app-pill-primary'
  if (status === 'paused' || status === 'scheduled') return 'app-pill-warning'
  if (status === 'failed' || status === 'cancelled') return 'app-pill-danger'
  if (status === 'completed') return 'app-pill-success'
  return 'app-pill-neutral'
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

async function pauseTask(taskId) {
  queueActionId.value = taskId
  try {
    const result = await $fetch(`/api/tasks/${taskId}/pause`, { method: 'POST' })
    toast.add({
      title: result?.pending ? '正在暂停' : '已暂停任务',
      description: result?.pending ? '当前识别分段完成后暂停，已完成进度会保留' : '恢复后会重新加入队列',
      color: 'success'
    })
    await Promise.all([refresh(), refreshQueue()])
  } catch (e) {
    toast.add({ title: '暂停失败', description: e?.data?.message || e?.message || '无法暂停任务', color: 'error' })
  } finally {
    queueActionId.value = ''
  }
}

async function changePriority(task, delta) {
  const next = Math.max(-1000, Math.min(1000, Number(task?.priority || 0) + delta))
  queueActionId.value = task.taskId
  try {
    await $fetch(`/api/tasks/${task.taskId}/priority`, { method: 'POST', body: { priority: next } })
    toast.add({ title: `优先级已调整为 P${next}`, description: '数值越大越先执行', color: 'success' })
    await Promise.all([refresh(), refreshQueue()])
  } catch (e) {
    toast.add({ title: '优先级调整失败', description: e?.data?.message || e?.message || '请稍后重试', color: 'error' })
  } finally {
    queueActionId.value = ''
  }
}

async function cancelTask(taskId) {
  if (!(await confirm({
    title: '取消这个任务？',
    description: '运行中的任务会停止，已完成的部分不会回滚。',
    confirmLabel: '取消任务',
    color: 'error'
  }))) return
  queueActionId.value = taskId
  try {
    await $fetch(`/api/tasks/${taskId}/cancel`, { method: 'POST' })
    toast.add({ title: '任务已取消', color: 'success' })
    await Promise.all([refresh(), refreshQueue()])
  } catch (e) {
    toast.add({ title: '取消失败', description: e?.data?.message || e?.message || '无法取消任务', color: 'error' })
  } finally {
    queueActionId.value = ''
  }
}

async function resumeTask(taskId) {
  resumingTaskId.value = taskId
  try {
    await $fetch(`/api/tasks/${taskId}/resume`, { method: 'POST' })
    toast.add({ title: '已恢复', description: '任务将复用已完成的识别分段继续执行', color: 'success' })
    await Promise.all([refresh(), refreshQueue()])
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

function canPauseQueue(task) {
  const status = String(task?.status || '')
  if (task?.pauseRequested || ['paused', 'done', 'error', 'cancelled', 'review'].includes(status)) return false
  const queueStatus = String(task?.queueStatus || '')
  if (queueStatus === 'running') {
    return String(task?.sourceType || '') === 'asr'
      && !['parsing', 'translating', 'exporting'].includes(status)
  }
  return ['queued', 'retrying'].includes(queueStatus || status)
}

function canChangeQueuePriority(task) {
  const queueStatus = String(task?.queueStatus || '')
  if (queueStatus) return ['queued', 'paused'].includes(queueStatus)
  return ['queued', 'paused'].includes(String(task?.status || ''))
}

function rowActionItems(task) {
  const items = []
  const format = String(task?.subtitle_format || task?.subtitleFormat || 'srt')
  const status = String(task?.status || '')
  const terminal = ['done', 'error', 'cancelled', 'review'].includes(status)

  if (status === 'done') {
    if (format === 'vtt') {
      items.push({ label: '下载 VTT', icon: 'i-lucide-file-text', onSelect: () => downloadSubtitle(task.taskId, 'vtt') })
    } else if (format === 'ttml') {
      items.push({ label: '下载 TTML', icon: 'i-lucide-file-code', onSelect: () => downloadSubtitle(task.taskId, 'ttml') })
    } else {
      if (format !== 'ass') {
        items.push({ label: '下载 SRT', icon: 'i-lucide-file-text', onSelect: () => downloadSubtitle(task.taskId, 'srt') })
      }
      if (format !== 'srt') {
        items.push({ label: '下载 ASS', icon: 'i-lucide-file-code', onSelect: () => downloadSubtitle(task.taskId, 'ass') })
      }
    }
  }

  if (!terminal) {
    if (items.length) items.push({ type: 'separator' })
    if (status === 'paused') {
      items.push({ label: '继续排队', icon: 'i-lucide-play', onSelect: () => resumeTask(task.taskId) })
    } else if (canPauseQueue(task)) {
      items.push({
        label: String(task?.queueStatus) === 'running' ? '暂停任务' : '暂停排队',
        icon: 'i-lucide-pause',
        onSelect: () => pauseTask(task.taskId)
      })
    }
    if (canChangeQueuePriority(task)) {
      items.push(
        { label: '提高优先级', icon: 'i-lucide-arrow-up', onSelect: () => changePriority(task, 10) },
        { label: '降低优先级', icon: 'i-lucide-arrow-down', onSelect: () => changePriority(task, -10) }
      )
    } else {
      items.push({ label: '运行中不可调整优先级', icon: 'i-lucide-lock', disabled: true })
    }
    items.push(
      { type: 'separator' },
      { label: '取消任务', icon: 'i-lucide-octagon-x', color: 'error', onSelect: () => cancelTask(task.taskId) }
    )
  }

  if (terminal) {
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
  return ['queued', 'retrying', 'probing', 'extracting', 'extracting_audio', 'transcribing', 'ocr', 'parsing', 'translating', 'exporting'].includes(String(status || ''))
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
  vtt: 'VTT',
  ttml: 'TTML',
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
