<template>
  <details ref="detailsEl" class="group surface-card overflow-hidden">
    <summary class="list-none cursor-pointer px-3 py-2.5 transition-colors hover:bg-gray-50/70 dark:hover:bg-gray-900/30 sm:px-4" @click="handleSummaryClick">
      <div class="flex items-center justify-between gap-3">
        <div class="flex min-w-0 items-center gap-2.5">
          <span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400">
            <UIcon name="i-lucide-chart-no-axes-combined" class="h-4 w-4" />
          </span>
          <div class="min-w-0">
            <div class="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span class="text-sm font-semibold text-gray-900 dark:text-white">运行与诊断</span>
              <span class="app-pill app-pill-neutral">{{ data ? `最近 ${data.diagnostics.summary.totalTasks} 个任务` : (taskTotal ? `共 ${taskTotal} 条任务` : '展开加载') }}</span>
            </div>
            <p v-if="overviewSummaryText" class="app-meta mt-0.5 truncate">{{ overviewSummaryText }}</p>
            <p v-else class="app-meta mt-0.5">汇总任务运行、字幕覆盖、费用与诊断风险，展开后按需加载。</p>
          </div>
        </div>
        <UIcon name="i-lucide-chevron-down" class="h-4 w-4 shrink-0 text-gray-400 transition-transform group-open:rotate-180" />
      </div>
    </summary>

    <div class="border-t border-gray-100 px-3 pb-3 pt-3 dark:border-gray-800 sm:px-4 sm:pb-4">
      <div v-if="pending" class="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
        <UIcon name="i-lucide-loader-2" class="h-4 w-4 animate-spin" /> 加载运行与诊断数据中...
      </div>
      <div v-else-if="error" class="rounded-xl border border-error-200/70 bg-error-50/80 p-3 text-xs text-error-700 dark:border-error-900/40 dark:bg-error-950/20 dark:text-error-300">
        运行与诊断加载失败：{{ error.message || error }}
      </div>
      <template v-else-if="data">
        <div class="flex flex-wrap items-center gap-2">
          <div class="flex flex-wrap gap-1" role="group" aria-label="运行与诊断视图">
            <UButton
              label="运行状态"
              size="xs"
              :color="activeTab === 'runtime' ? 'primary' : 'neutral'"
              variant="soft"
              :aria-pressed="activeTab === 'runtime'"
              @click="activeTab = 'runtime'"
            />
            <UButton
              label="诊断风险"
              size="xs"
              :color="activeTab === 'diagnostics' ? 'primary' : 'neutral'"
              variant="soft"
              :aria-pressed="activeTab === 'diagnostics'"
              @click="activeTab = 'diagnostics'"
            />
          </div>
          <UButton label="刷新" icon="i-lucide-refresh-cw" size="xs" color="neutral" variant="ghost" class="ml-auto" :loading="pending" @click="refreshOverview" />
        </div>

        <div v-show="activeTab === 'runtime'" class="mt-3 space-y-3">
          <div class="grid grid-cols-2 gap-2 lg:grid-cols-4">
            <div v-for="card in runtimeKpis" :key="card.label" class="app-stat">
              <div class="flex items-start justify-between gap-2">
                <div class="min-w-0">
                  <p class="stat-label">{{ card.label }}</p>
                  <p class="stat-value mt-1">{{ card.value }}</p>
                </div>
                <span class="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg" :class="card.iconClass">
                  <UIcon :name="card.icon" class="h-3.5 w-3.5" />
                </span>
              </div>
              <p class="app-meta mt-1.5">{{ card.hint }}</p>
            </div>
          </div>

          <div class="grid gap-3 xl:grid-cols-[minmax(0,1.45fr)_minmax(280px,0.55fr)]">
            <div class="surface-muted p-3 sm:p-4">
              <div class="flex items-center justify-between gap-2">
                <div>
                  <p class="text-sm font-semibold text-gray-900 dark:text-white">最近 7 天任务</p>
                  <p class="app-meta">完成与失败数量对比</p>
                </div>
                <div class="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
                  <span class="flex items-center gap-1"><span class="h-2 w-2 rounded-full bg-success-500" />完成</span>
                  <span class="flex items-center gap-1"><span class="h-2 w-2 rounded-full bg-error-400" />失败</span>
                </div>
              </div>
              <div class="mt-4 flex h-32 items-end gap-2">
                <div v-for="item in data.runtime.activity" :key="item.date" class="group flex min-w-0 flex-1 flex-col items-center gap-1">
                  <div class="flex h-full w-full items-end justify-center gap-0.5">
                    <div class="w-1/3 rounded-t bg-success-500/85 transition-all duration-500 group-hover:bg-success-400" :style="{ height: barHeight(item.done) }" :title="`${item.date} 完成 ${item.done}`" />
                    <div class="w-1/3 rounded-t bg-error-400/80 transition-all duration-500 group-hover:bg-error-300" :style="{ height: barHeight(item.failed) }" :title="`${item.date} 失败 ${item.failed}`" />
                  </div>
                  <span class="text-xs text-gray-500 dark:text-gray-400">{{ item.label }}</span>
                </div>
              </div>
            </div>

            <div class="surface-muted p-3 sm:p-4">
              <div class="flex items-center justify-between gap-2">
                <div>
                  <p class="text-sm font-semibold text-gray-900 dark:text-white">字幕覆盖</p>
                  <p class="app-meta">来自最近一次覆盖索引</p>
                </div>
                <UButton label="查看" size="xs" color="neutral" variant="ghost" to="/coverage" />
              </div>
              <div class="mt-3 flex items-center gap-4">
                <div class="relative h-24 w-24 shrink-0">
                  <div class="h-full w-full rounded-full" :style="{ background: coverageDonut }" />
                  <div class="absolute inset-[11px] flex flex-col items-center justify-center rounded-full bg-white dark:bg-gray-950">
                    <span class="text-xl font-black text-gray-900 dark:text-white">{{ coverageRate }}%</span>
                    <span class="text-xs uppercase tracking-widest text-gray-500 dark:text-gray-400">覆盖</span>
                  </div>
                </div>
                <div class="min-w-0 flex-1 space-y-1.5 text-xs">
                  <div v-for="item in coverageLegend" :key="item.key" class="flex items-center justify-between gap-2">
                    <span class="flex items-center gap-1.5 text-gray-500 dark:text-gray-400"><span class="h-1.5 w-1.5 rounded-full" :style="{ backgroundColor: item.color }" />{{ item.label }}</span>
                    <span class="font-semibold text-gray-800 dark:text-gray-100">{{ item.value }}</span>
                  </div>
                </div>
              </div>
              <p v-if="!data.runtime.coverage.available" class="app-meta mt-3">还没有覆盖索引，打开覆盖检查后会生成。</p>
            </div>
          </div>

          <div class="grid gap-3 md:grid-cols-3">
            <div class="app-stat p-3 sm:p-4">
              <p class="stat-label">队列预计</p>
              <p class="mt-1 text-2xl font-black text-gray-900 dark:text-white">{{ formatEta(data.runtime.queue.etaSeconds) }}</p>
              <p class="app-meta mt-1">并发 {{ data.runtime.queue.concurrency }} · 平均 {{ formatDuration(data.runtime.queue.avgDurationMs) }}</p>
              <div class="mt-3 h-1.5 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
                <div class="h-full rounded-full bg-sky-500 transition-all duration-500" :style="{ width: `${Math.min(100, data.runtime.queue.running / Math.max(1, data.runtime.queue.concurrency) * 100)}%` }" />
              </div>
            </div>

            <div class="app-stat p-3 sm:p-4">
              <div class="flex items-center justify-between gap-2">
                <p class="stat-label">本月预算</p>
                <span class="app-meta">{{ data.runtime.cost.month }}</span>
              </div>
              <p class="mt-1 text-2xl font-black text-gray-900 dark:text-white">${{ data.runtime.cost.spentUsd.toFixed(4) }}</p>
              <p class="app-meta mt-1">
                {{ data.runtime.cost.budgetEnabled ? `上限 $${data.runtime.cost.budgetUsd.toFixed(2)} · 剩余 $${data.runtime.cost.remainingUsd.toFixed(2)}` : '未启用预算上限' }}
              </p>
              <div class="mt-3 h-1.5 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
                <div class="h-full rounded-full transition-all duration-500" :class="budgetPercent >= 90 ? 'bg-error-500' : budgetPercent >= 70 ? 'bg-warning-500' : 'bg-success-500'" :style="{ width: `${budgetPercent}%` }" />
              </div>
            </div>

            <div class="app-stat p-3 sm:p-4">
              <div class="flex items-center justify-between gap-2">
                <p class="stat-label">翻译记忆</p>
                <UIcon name="i-lucide-brain-circuit" class="h-4 w-4 text-primary-600 dark:text-primary-400" />
              </div>
              <p class="mt-1 text-2xl font-black text-gray-900 dark:text-white">{{ data.runtime.memory.total.toLocaleString() }}</p>
              <p class="app-meta mt-1">已学习双语对照，命中后直接复用</p>
              <div class="mt-3 flex flex-wrap gap-1.5">
                <span v-for="item in data.runtime.memory.byLanguage.slice(0, 4)" :key="item.targetLanguage" class="app-pill app-pill-neutral">
                  {{ item.targetLanguage }} {{ item.entries }}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div v-show="activeTab === 'diagnostics'" class="mt-3 space-y-3">
          <div class="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-8">
            <div v-for="stat in diagnosticStats" :key="stat.label" class="app-stat px-3 py-2">
              <p class="stat-label">{{ stat.label }}</p>
              <p class="mt-0.5 text-lg font-bold tabular-nums" :class="stat.className">{{ stat.value }}</p>
            </div>
          </div>

          <div class="grid gap-3 xl:grid-cols-3">
            <div class="app-stat space-y-2 p-3">
              <p class="app-section-title">高风险标签</p>
              <div class="flex flex-wrap gap-2">
                <span v-for="risk in data.diagnostics.riskTags.slice(0, 8)" :key="risk.tag" class="app-pill app-pill-primary">{{ riskTagLabel(risk.tag) }} × {{ risk.count }}</span>
                <span v-if="!data.diagnostics.riskTags.length" class="app-caption">暂无</span>
              </div>
            </div>
            <div class="app-stat space-y-2 p-3">
              <p class="app-section-title">响应异常</p>
              <div class="flex flex-wrap gap-2">
                <span v-for="issue in data.diagnostics.responseIssues.slice(0, 8)" :key="issue.issue" class="app-pill app-pill-warning">{{ issueLabel(issue.issue) }} × {{ issue.count }}</span>
                <span v-if="!data.diagnostics.responseIssues.length" class="app-caption">暂无</span>
              </div>
            </div>
            <div class="app-stat space-y-2 p-3">
              <p class="app-section-title">核对原因</p>
              <div class="flex flex-wrap gap-2">
                <span v-for="reason in data.diagnostics.reviewReasons.slice(0, 8)" :key="reason.reason" class="app-pill app-pill-error">{{ reviewReasonLabel(reason.reason) }} × {{ reason.count }}</span>
                <span v-if="!data.diagnostics.reviewReasons.length" class="app-caption">暂无</span>
              </div>
            </div>
          </div>
        </div>
      </template>
    </div>
  </details>
</template>

<script setup lang="ts">
import { reviewReasonLabel } from '~~/shared/reviewLabels'
import type { OperationsOverview } from '~~/types'

defineProps<{ taskTotal?: number }>()
const activeTab = ref<'runtime' | 'diagnostics'>('runtime')
const detailsEl = ref<HTMLDetailsElement | null>(null)
const { data, pending, error, execute } = useLazyFetch<OperationsOverview>('/api/operations/overview', {
  server: false,
  immediate: false
})

onMounted(() => {
  // A click may happen before hydration; honor an already-open panel.
  if (detailsEl.value?.open && !data.value && !pending.value) void execute()
})

const riskTagLabels: Record<string, string> = {
  non_dialogue: '非对白内容',
  lyrics: '歌词/吟唱',
  formatting_tokens: '格式标记密集',
  repeated_short_lines: '短句重复较多',
  punctuation_heavy: '符号密集',
  speaker_labels: '说话人标签',
  mixed_language: '多语言混杂',
  long_lines: '长句较多'
}
const issueLabels: Record<string, string> = {
  empty: '空响应',
  refusal: '疑似拒答',
  filtered: '已被过滤',
  structured: '结构化输出',
  plain: '文本输出(正常)'
}
const riskTagLabel = (tag: string) => riskTagLabels[tag] || tag
const issueLabel = (issue: string) => issueLabels[issue] || issue

function handleSummaryClick(event: Event) {
  const details = (event.currentTarget as HTMLElement | null)?.closest('details') as HTMLDetailsElement | null
  if (!details) return
  const willOpen = details.open === false
  if (willOpen && !data.value && !pending.value) void execute()
}

function refreshOverview() {
  if (!pending.value) void execute()
}

const runtimeKpis = computed(() => {
  const runtime = data.value?.runtime
  return [
    { label: '运行中', value: runtime?.tasks.active || 0, icon: 'i-lucide-activity', iconClass: 'bg-sky-50 text-sky-600 dark:bg-sky-950/30 dark:text-sky-400', hint: `排队 ${runtime?.tasks.queued || 0} 个任务` },
    { label: '待核对', value: runtime?.tasks.review || 0, icon: 'i-lucide-list-checks', iconClass: 'bg-amber-50 text-amber-600 dark:bg-amber-950/30 dark:text-amber-400', hint: '低分或技术问题需要确认' },
    { label: '字幕缺失', value: runtime?.coverage.missing || 0, icon: 'i-lucide-circle-dashed', iconClass: 'bg-orange-50 text-orange-600 dark:bg-orange-950/30 dark:text-orange-400', hint: runtime?.coverage.available ? '来自覆盖索引' : '打开覆盖检查后生成' },
    { label: '本月费用', value: `$${(runtime?.cost.spentUsd || 0).toFixed(2)}`, icon: 'i-lucide-wallet', iconClass: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/30 dark:text-emerald-400', hint: runtime?.cost.budgetEnabled ? `上限 $${runtime.cost.budgetUsd.toFixed(2)}` : '未启用预算上限' }
  ]
})

const diagnosticStats = computed(() => {
  const diagnostics = data.value?.diagnostics
  if (!diagnostics) return []
  return [
    { label: '完成', value: diagnostics.summary.doneTasks, className: 'text-success-600 dark:text-success-400' },
    { label: '待核对', value: diagnostics.summary.reviewTasks, className: 'text-warning-600 dark:text-warning-400' },
    { label: '失败', value: diagnostics.summary.errorTasks, className: 'text-error-600 dark:text-error-400' },
    { label: '取消', value: diagnostics.summary.cancelledTasks, className: 'text-gray-600 dark:text-gray-400' },
    { label: '缺条', value: diagnostics.translation.missingIdChunks, className: 'text-gray-900 dark:text-white' },
    { label: '重试', value: diagnostics.translation.retriedChunks, className: 'text-gray-900 dark:text-white' },
    { label: '补译', value: diagnostics.translation.singleRetriedChunks, className: 'text-gray-900 dark:text-white' },
    { label: '回退', value: diagnostics.translation.fallbackChunks, className: 'text-gray-900 dark:text-white' }
  ]
})

const overviewSummaryText = computed(() => {
  const value = data.value
  if (!value) return ''
  const abnormalResponses = value.diagnostics.responseIssues
    .filter(item => ['empty', 'refusal', 'filtered'].includes(item.issue))
    .reduce((sum, item) => sum + Number(item.count || 0), 0)
  return [
    `运行中 ${value.runtime.tasks.active}`,
    `待核对 ${value.runtime.tasks.review}`,
    `缺失字幕 ${value.runtime.coverage.missing}`,
    `异常响应 ${abnormalResponses} 次`,
    `本月 $${value.runtime.cost.spentUsd.toFixed(2)}`
  ].join(' · ')
})

const maxActivity = computed(() => Math.max(1, ...(data.value?.runtime.activity || []).map(item => Math.max(item.done, item.failed))))
function barHeight(value: number) {
  return `${Math.max(4, (value / maxActivity.value) * 100)}%`
}

const coverageLegend = computed(() => {
  const coverage = data.value?.runtime.coverage
  if (!coverage) return []
  return [
    { key: 'done', label: '已完成', value: coverage.done, color: '#10b981' },
    { key: 'missing', label: '缺失', value: coverage.missing, color: '#f97316' },
    { key: 'review', label: '待核对', value: coverage.review, color: '#f59e0b' },
    { key: 'processing', label: '处理中', value: coverage.processing, color: '#0ea5e9' },
    { key: 'failed', label: '失败', value: coverage.failed, color: '#ef4444' }
  ].filter(item => item.value > 0)
})
const coverageRate = computed(() => {
  const coverage = data.value?.runtime.coverage
  if (!coverage?.total) return 0
  return Math.round((coverage.done / coverage.total) * 100)
})
const coverageDonut = computed(() => {
  const coverage = data.value?.runtime.coverage
  if (!coverage?.total) return 'conic-gradient(#e5e7eb 0 100%)'
  let cursor = 0
  const stops = coverageLegend.value.map(item => {
    const start = cursor
    cursor += (item.value / coverage.total) * 100
    return `${item.color} ${start}% ${cursor}%`
  })
  return `conic-gradient(${stops.join(', ')})`
})
const budgetPercent = computed(() => {
  const cost = data.value?.runtime.cost
  if (!cost?.budgetEnabled || !cost.budgetUsd) return 0
  return Math.min(100, Math.round((cost.spentUsd / cost.budgetUsd) * 100))
})

function formatDuration(ms: number) {
  if (!ms) return '尚无数据'
  const minutes = Math.round(ms / 60000)
  if (minutes < 1) return '<1 分钟'
  if (minutes < 60) return `${minutes} 分钟`
  return `${(minutes / 60).toFixed(1)} 小时`
}
function formatEta(seconds: number) {
  if (!seconds) return '暂无估算'
  if (seconds < 60) return `${seconds} 秒`
  if (seconds < 3600) return `${Math.round(seconds / 60)} 分钟`
  return `${(seconds / 3600).toFixed(1)} 小时`
}
</script>
