<template>
  <details class="group surface-card overflow-hidden p-2" @toggle="handleToggle">
    <summary class="list-none cursor-pointer flex flex-col gap-3 rounded-xl bg-white/85 px-4 py-4 dark:bg-gray-900/70 sm:flex-row sm:items-start sm:justify-between sm:px-5">
      <div class="space-y-1">
        <div class="flex items-center gap-2 text-gray-900 dark:text-white">
          <UIcon name="i-lucide-chart-no-axes-combined" class="h-4 w-4" />
          <span class="text-sm font-semibold">运行与诊断</span>
        </div>
        <p class="text-xs leading-relaxed text-gray-500 dark:text-gray-400">聚合任务运行、字幕覆盖、费用、翻译记忆与诊断风险，默认折叠，展开后按需加载。</p>
        <p v-if="overviewSummaryText" class="text-[11px] text-gray-600 dark:text-gray-300">{{ overviewSummaryText }}</p>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <UBadge color="neutral" variant="subtle">{{ data ? `最近 ${data.diagnostics.summary.totalTasks} 个任务` : (taskTotal ? `共 ${taskTotal} 条任务` : '展开加载') }}</UBadge>
        <UIcon name="i-lucide-chevron-down" class="h-4 w-4 shrink-0 text-gray-400 transition-transform group-open:rotate-180" />
      </div>
    </summary>

    <div class="space-y-4 px-4 pb-4 sm:px-5 sm:pb-5">
      <div v-if="pending" class="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
        <UIcon name="i-lucide-loader-2" class="h-4 w-4 animate-spin" /> 加载运行与诊断数据中...
      </div>
      <div v-else-if="error" class="rounded-xl border border-red-200/70 bg-red-50/80 p-3 text-xs text-red-700 dark:border-red-900/40 dark:bg-red-950/20 dark:text-red-300">
        运行与诊断加载失败：{{ error.message || error }}
      </div>
      <template v-else-if="data">
        <div class="flex flex-wrap items-center gap-2">
          <div class="inline-flex rounded-xl border border-gray-200/80 bg-gray-50 p-1 dark:border-gray-800 dark:bg-gray-900/60">
          <button
            type="button"
            class="rounded-lg px-3 py-1.5 text-xs font-medium transition-colors"
            :class="activeTab === 'runtime' ? 'bg-white text-primary-700 shadow-sm dark:bg-gray-950 dark:text-primary-400' : 'text-gray-500 dark:text-gray-400'"
            :aria-pressed="activeTab === 'runtime'"
            @click="activeTab = 'runtime'"
          >
            运行状态
          </button>
          <button
            type="button"
            class="rounded-lg px-3 py-1.5 text-xs font-medium transition-colors"
            :class="activeTab === 'diagnostics' ? 'bg-white text-primary-700 shadow-sm dark:bg-gray-950 dark:text-primary-400' : 'text-gray-500 dark:text-gray-400'"
            :aria-pressed="activeTab === 'diagnostics'"
            @click="activeTab = 'diagnostics'"
          >
            诊断风险
          </button>
          </div>
          <UButton label="刷新" icon="i-lucide-refresh-cw" size="xs" color="neutral" variant="ghost" class="ml-auto" :loading="pending" @click="refreshOverview" />
        </div>

        <div v-show="activeTab === 'runtime'" class="space-y-4">
          <div class="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <div v-for="card in runtimeKpis" :key="card.label" class="surface-card p-3">
              <div class="flex items-start justify-between gap-2">
                <div>
                  <p class="stat-label">{{ card.label }}</p>
                  <p class="stat-value mt-1">{{ card.value }}</p>
                </div>
                <span class="flex h-7 w-7 items-center justify-center rounded-lg" :class="card.iconClass">
                  <UIcon :name="card.icon" class="h-3.5 w-3.5" />
                </span>
              </div>
              <p class="mt-1.5 text-[11px] leading-5 text-gray-500 dark:text-gray-400">{{ card.hint }}</p>
            </div>
          </div>

          <div class="grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(280px,0.55fr)]">
            <div class="surface-card p-4">
              <div class="flex items-center justify-between gap-2">
                <div>
                  <p class="text-sm font-semibold text-gray-900 dark:text-white">最近 7 天任务</p>
                  <p class="text-[11px] text-gray-500 dark:text-gray-400">完成与失败数量对比</p>
                </div>
                <div class="flex items-center gap-3 text-[10px] text-gray-500 dark:text-gray-400">
                  <span class="flex items-center gap-1"><span class="h-2 w-2 rounded-full bg-emerald-500" />完成</span>
                  <span class="flex items-center gap-1"><span class="h-2 w-2 rounded-full bg-red-400" />失败</span>
                </div>
              </div>
              <div class="mt-4 flex h-32 items-end gap-2">
                <div v-for="item in data.runtime.activity" :key="item.date" class="group flex min-w-0 flex-1 flex-col items-center gap-1">
                  <div class="flex h-full w-full items-end justify-center gap-0.5">
                    <div class="w-1/3 rounded-t bg-emerald-500/85 transition-all duration-500 group-hover:bg-emerald-400" :style="{ height: barHeight(item.done) }" :title="`${item.date} 完成 ${item.done}`" />
                    <div class="w-1/3 rounded-t bg-red-400/80 transition-all duration-500 group-hover:bg-red-300" :style="{ height: barHeight(item.failed) }" :title="`${item.date} 失败 ${item.failed}`" />
                  </div>
                  <span class="text-[10px] text-gray-500 dark:text-gray-400">{{ item.label }}</span>
                </div>
              </div>
            </div>

            <div class="surface-card p-4">
              <div class="flex items-center justify-between gap-2">
                <div>
                  <p class="text-sm font-semibold text-gray-900 dark:text-white">字幕覆盖</p>
                  <p class="text-[11px] text-gray-500 dark:text-gray-400">来自最近一次覆盖索引</p>
                </div>
                <UButton label="查看" size="xs" color="neutral" variant="ghost" to="/coverage" />
              </div>
              <div class="mt-3 flex items-center gap-4">
                <div class="relative h-24 w-24 shrink-0">
                  <div class="h-full w-full rounded-full" :style="{ background: coverageDonut }" />
                  <div class="absolute inset-[11px] flex flex-col items-center justify-center rounded-full bg-white dark:bg-gray-950">
                    <span class="text-xl font-black text-gray-900 dark:text-white">{{ coverageRate }}%</span>
                    <span class="text-[10px] uppercase tracking-widest text-gray-500 dark:text-gray-400">覆盖</span>
                  </div>
                </div>
                <div class="min-w-0 flex-1 space-y-1.5 text-[11px]">
                  <div v-for="item in coverageLegend" :key="item.key" class="flex items-center justify-between gap-2">
                    <span class="flex items-center gap-1.5 text-gray-500 dark:text-gray-400"><span class="h-1.5 w-1.5 rounded-full" :style="{ backgroundColor: item.color }" />{{ item.label }}</span>
                    <span class="font-semibold text-gray-800 dark:text-gray-100">{{ item.value }}</span>
                  </div>
                </div>
              </div>
              <p v-if="!data.runtime.coverage.available" class="mt-3 text-[11px] leading-5 text-gray-500 dark:text-gray-400">还没有覆盖索引，打开覆盖检查后会生成。</p>
            </div>
          </div>

          <div class="grid gap-3 md:grid-cols-3">
            <div class="surface-card p-4">
              <p class="text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">队列预计</p>
              <p class="mt-1 text-2xl font-black text-gray-900 dark:text-white">{{ formatEta(data.runtime.queue.etaSeconds) }}</p>
              <p class="mt-1 text-[11px] text-gray-500 dark:text-gray-400">并发 {{ data.runtime.queue.concurrency }} · 平均 {{ formatDuration(data.runtime.queue.avgDurationMs) }}</p>
              <div class="mt-3 h-1.5 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
                <div class="h-full rounded-full bg-sky-500 transition-all duration-500" :style="{ width: `${Math.min(100, data.runtime.queue.running / Math.max(1, data.runtime.queue.concurrency) * 100)}%` }" />
              </div>
            </div>

            <div class="surface-card p-4">
              <div class="flex items-center justify-between gap-2">
                <p class="text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">本月预算</p>
                <span class="text-[10px] text-gray-500 dark:text-gray-400">{{ data.runtime.cost.month }}</span>
              </div>
              <p class="mt-1 text-2xl font-black text-gray-900 dark:text-white">${{ data.runtime.cost.spentUsd.toFixed(4) }}</p>
              <p class="mt-1 text-[11px] text-gray-500 dark:text-gray-400">
                {{ data.runtime.cost.budgetEnabled ? `上限 $${data.runtime.cost.budgetUsd.toFixed(2)} · 剩余 $${data.runtime.cost.remainingUsd.toFixed(2)}` : '未启用预算上限' }}
              </p>
              <div class="mt-3 h-1.5 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
                <div class="h-full rounded-full transition-all duration-500" :class="budgetPercent >= 90 ? 'bg-red-500' : budgetPercent >= 70 ? 'bg-amber-500' : 'bg-emerald-500'" :style="{ width: `${budgetPercent}%` }" />
              </div>
            </div>

            <div class="surface-card p-4">
              <div class="flex items-center justify-between gap-2">
                <p class="text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">翻译记忆</p>
                <UIcon name="i-lucide-brain-circuit" class="h-4 w-4 text-primary-600 dark:text-primary-400" />
              </div>
              <p class="mt-1 text-2xl font-black text-gray-900 dark:text-white">{{ data.runtime.memory.total.toLocaleString() }}</p>
              <p class="mt-1 text-[11px] text-gray-500 dark:text-gray-400">已学习双语对照，命中后直接复用</p>
              <div class="mt-3 flex flex-wrap gap-1.5">
                <UBadge v-for="item in data.runtime.memory.byLanguage.slice(0, 4)" :key="item.targetLanguage" color="neutral" variant="subtle" size="sm">
                  {{ item.targetLanguage }} {{ item.entries }}
                </UBadge>
              </div>
            </div>
          </div>
        </div>

        <div v-show="activeTab === 'diagnostics'" class="space-y-4">
          <div class="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
            <div class="surface-card px-3 py-3"><p class="stat-label">完成</p><p class="stat-value text-green-600 dark:text-green-400">{{ data.diagnostics.summary.doneTasks }}</p></div>
            <div class="surface-card px-3 py-3"><p class="stat-label">待核对</p><p class="stat-value text-amber-600 dark:text-amber-400">{{ data.diagnostics.summary.reviewTasks }}</p></div>
            <div class="surface-card px-3 py-3"><p class="stat-label">失败</p><p class="stat-value text-red-600 dark:text-red-400">{{ data.diagnostics.summary.errorTasks }}</p></div>
            <div class="surface-card px-3 py-3"><p class="stat-label">取消</p><p class="stat-value text-gray-600 dark:text-gray-400">{{ data.diagnostics.summary.cancelledTasks }}</p></div>
            <div class="surface-card px-3 py-3"><p class="stat-label">缺条</p><p class="stat-value">{{ data.diagnostics.translation.missingIdChunks }}</p></div>
            <div class="surface-card px-3 py-3"><p class="stat-label">重试</p><p class="stat-value">{{ data.diagnostics.translation.retriedChunks }}</p></div>
            <div class="surface-card px-3 py-3"><p class="stat-label">补译</p><p class="stat-value">{{ data.diagnostics.translation.singleRetriedChunks }}</p></div>
            <div class="surface-card px-3 py-3"><p class="stat-label">回退</p><p class="stat-value">{{ data.diagnostics.translation.fallbackChunks }}</p></div>
          </div>

          <div class="grid gap-4 xl:grid-cols-3">
            <div class="space-y-2 rounded-2xl border border-gray-200/70 bg-gray-50/80 p-4 dark:border-gray-800 dark:bg-gray-900/70">
              <p class="text-xs font-semibold text-gray-900 dark:text-white">高风险标签</p>
              <div class="flex flex-wrap gap-2">
                <UBadge v-for="risk in data.diagnostics.riskTags.slice(0, 8)" :key="risk.tag" color="primary" variant="soft">{{ riskTagLabel(risk.tag) }} × {{ risk.count }}</UBadge>
                <span v-if="!data.diagnostics.riskTags.length" class="text-xs text-gray-500 dark:text-gray-400">暂无</span>
              </div>
            </div>
            <div class="space-y-2 rounded-2xl border border-gray-200/70 bg-gray-50/80 p-4 dark:border-gray-800 dark:bg-gray-900/70">
              <p class="text-xs font-semibold text-gray-900 dark:text-white">响应异常</p>
              <div class="flex flex-wrap gap-2">
                <UBadge v-for="issue in data.diagnostics.responseIssues.slice(0, 8)" :key="issue.issue" color="warning" variant="soft">{{ issueLabel(issue.issue) }} × {{ issue.count }}</UBadge>
                <span v-if="!data.diagnostics.responseIssues.length" class="text-xs text-gray-500 dark:text-gray-400">暂无</span>
              </div>
            </div>
            <div class="space-y-2 rounded-2xl border border-gray-200/70 bg-gray-50/80 p-4 dark:border-gray-800 dark:bg-gray-900/70">
              <p class="text-xs font-semibold text-gray-900 dark:text-white">核对原因</p>
              <div class="flex flex-wrap gap-2">
                <UBadge v-for="reason in data.diagnostics.reviewReasons.slice(0, 8)" :key="reason.reason" color="error" variant="soft">{{ reviewReasonLabel(reason.reason) }} × {{ reason.count }}</UBadge>
                <span v-if="!data.diagnostics.reviewReasons.length" class="text-xs text-gray-500 dark:text-gray-400">暂无</span>
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
const { data, pending, error, execute } = useLazyFetch<OperationsOverview>('/api/operations/overview', {
  server: false,
  immediate: false
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

function handleToggle(event: Event) {
  const open = (event.target as HTMLDetailsElement)?.open === true
  if (open && !data.value && !pending.value) void execute()
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

const overviewSummaryText = computed(() => {
  const value = data.value
  if (!value) return ''
  return [
    `缺失字幕 ${value.runtime.coverage.missing}`,
    `待核对 ${value.runtime.tasks.review}`,
    `本月 $${value.runtime.cost.spentUsd.toFixed(2)}`,
    `异常响应 ${value.diagnostics.responseIssues.filter(item => ['empty', 'refusal', 'filtered'].includes(item.issue)).reduce((sum, item) => sum + Number(item.count || 0), 0)} 次`
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
