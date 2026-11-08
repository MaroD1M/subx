<template>
  <div class="rounded-2xl border border-gray-200/70 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-gray-950/70">
    <div class="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div class="space-y-1">
        <div class="flex items-center gap-2 text-gray-700 dark:text-gray-200">
          <UIcon name="i-lucide-logs" class="h-4 w-4 text-primary-700" />
          <span class="text-sm font-semibold">任务执行日志</span>
        </div>
        <p class="text-xs text-gray-500 dark:text-gray-400">仅记录任务处理过程，不包含页面实时连接状态。</p>
      </div>
      <div class="flex items-center gap-2 self-start sm:self-auto">
        <UBadge color="neutral" variant="subtle">显示 {{ displayedLogs.length }} / {{ logs.length }} 条</UBadge>
        <UButton
          v-if="logs.length > compactLogLimit"
          :label="showAllLogs ? '收起次要日志' : '显示全部日志'"
          size="xs"
          color="neutral"
          variant="ghost"
          class="h-7 px-2"
          @click="showAllLogs = !showAllLogs"
        />
      </div>
    </div>
    <div ref="logContainer" class="custom-scrollbar h-56 space-y-3 overflow-y-auto pr-1 sm:pr-2" role="log" aria-label="任务执行日志">
      <div
        v-for="(log, i) in displayedLogs"
        :key="i"
        class="flex flex-col items-start gap-3 rounded-2xl border px-3 py-3 shadow-sm sm:flex-row"
        :class="logItemClass(log)"
      >
        <div class="flex w-full shrink-0 flex-row items-center justify-between gap-2 sm:w-auto sm:min-w-[78px] sm:flex-col sm:items-start">
          <ClientOnly><span class="text-[10px] leading-none text-gray-500 dark:text-gray-400">{{ log.timestamp }}</span></ClientOnly>
          <UBadge size="sm" variant="soft" :color="logBadgeColor(log)" class="shrink-0">{{ logCategoryLabel(log) }}</UBadge>
        </div>
        <div class="w-full min-w-0 flex-1 border-t border-black/5 pt-3 dark:border-white/10 sm:border-l sm:border-t-0 sm:pl-3 sm:pt-0">
          <p class="break-words text-sm leading-6" :class="logMessageClass(log)">{{ log.message }}</p>
        </div>
      </div>
      <div v-if="currentText" class="flex flex-col items-start gap-3 rounded-2xl border border-emerald-500/20 bg-emerald-50 px-3 py-3 shadow-sm dark:bg-emerald-500/10 sm:flex-row">
        <div class="flex w-full shrink-0 flex-row items-center justify-between gap-2 sm:w-auto sm:min-w-[78px] sm:flex-col sm:items-start">
          <ClientOnly><span class="text-[10px] leading-none text-gray-500 dark:text-gray-400">{{ currentTextTimestamp || formatClock() }}</span></ClientOnly>
          <UBadge size="sm" variant="soft" color="success" class="shrink-0">实时进度</UBadge>
        </div>
        <div class="w-full min-w-0 flex-1 border-t border-emerald-500/20 pt-3 sm:border-l sm:border-t-0 sm:pl-3 sm:pt-0">
          <p class="break-words text-sm leading-6 text-emerald-700 dark:text-emerald-300">{{ currentText }}</p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { formatClock as formatClockInZone } from '~~/shared/time'

type TaskLogEntry = { type: 'info' | 'error', message: string, timestamp: string, category?: 'system' | 'translation' | 'export' | 'error' | 'process' }

const props = defineProps<{
  logs: TaskLogEntry[]
  currentText?: string | null
  currentTextTimestamp?: string
}>()

const timeZone = useTimeZone()
const logContainer = ref<HTMLElement | null>(null)
const showAllLogs = ref(false)
const compactLogLimit = 12

function formatClock() {
  return formatClockInZone(new Date(), timeZone)
}

const displayedLogs = computed(() => {
  if (showAllLogs.value || props.logs.length <= compactLogLimit) return props.logs
  const importantIndices = new Set<number>()
  for (let i = 0; i < props.logs.length; i++) {
    const log = props.logs[i]!
    const category = resolveLogCategory(log)
    if (log.type === 'error' || category === 'system' || category === 'export') importantIndices.add(i)
  }
  const recentStart = Math.max(0, props.logs.length - 4)
  for (let i = recentStart; i < props.logs.length; i++) importantIndices.add(i)
  return props.logs.filter((_, index) => importantIndices.has(index))
})

watch(() => props.logs, () => {
  nextTick(() => {
    if (logContainer.value) logContainer.value.scrollTop = logContainer.value.scrollHeight
  })
}, { deep: true })

function resolveLogCategory(log: TaskLogEntry) {
  if (log.category) return log.category
  const text = log.message || ''
  if (log.type === 'error' || /\b(?:error|failed|failure)\b|失败|错误|中断|断开|异常|取消/i.test(text)) return 'error'
  if (/导出|保存|输出文件|write/i.test(text)) return 'export'
  if (/翻译|文本块|chunk|tokens|模型|术语表|风格/i.test(text)) return 'translation'
  if (/提取|解析|SRT|字幕|初始化|队列|状态变更|创建|加载/i.test(text)) return 'system'
  return 'process'
}

function logCategoryLabel(log: TaskLogEntry) {
  const labels = { system: '系统', translation: '翻译', export: '导出', error: '错误', process: '过程' }
  return labels[resolveLogCategory(log)] || '过程'
}

function logBadgeColor(log: TaskLogEntry) {
  switch (resolveLogCategory(log)) {
    case 'error': return 'error'
    case 'export': return 'success'
    case 'translation': return 'primary'
    case 'system': return 'warning'
    default: return 'neutral'
  }
}

function logItemClass(log: TaskLogEntry) {
  switch (resolveLogCategory(log)) {
    case 'error': return 'border-red-200 bg-red-50 dark:border-red-500/20 dark:bg-red-500/10'
    case 'export': return 'border-emerald-200 bg-emerald-50 dark:border-emerald-500/20 dark:bg-emerald-500/10'
    case 'translation': return 'border-primary-200 bg-primary-50 dark:border-primary-500/20 dark:bg-primary-500/10'
    case 'system': return 'border-amber-200 bg-amber-50 dark:border-amber-500/20 dark:bg-amber-500/10'
    default: return 'border-gray-200 bg-gray-50 dark:border-white/10 dark:bg-white/5'
  }
}

function logMessageClass(log: TaskLogEntry) {
  switch (resolveLogCategory(log)) {
    case 'error': return 'text-red-700 dark:text-red-300'
    case 'export': return 'text-emerald-700 dark:text-emerald-300'
    case 'translation': return 'text-primary-700 dark:text-primary-200'
    case 'system': return 'text-amber-700 dark:text-amber-200'
    default: return 'text-gray-700 dark:text-gray-300'
  }
}
</script>
