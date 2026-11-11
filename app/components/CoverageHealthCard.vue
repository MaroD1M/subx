<template>
  <section class="surface-card overflow-hidden p-3 sm:p-4">
    <div class="flex flex-col gap-4 lg:flex-row lg:items-center">
      <div class="flex items-center gap-4">
        <div class="relative h-28 w-28 shrink-0">
          <div class="h-full w-full rounded-full" :style="{ background: donutBackground }" />
          <div class="absolute inset-[13px] flex flex-col items-center justify-center rounded-full bg-white text-center shadow-inner dark:bg-gray-950">
            <span class="text-2xl font-black tracking-tight text-gray-900 dark:text-white">{{ completionRate }}%</span>
            <span class="text-[10px] font-semibold uppercase tracking-widest text-gray-500 dark:text-gray-400">已覆盖</span>
          </div>
        </div>
        <div class="min-w-0">
          <p class="text-sm font-semibold text-gray-900 dark:text-white">字幕覆盖健康度</p>
          <p class="mt-1 text-xs leading-5 text-gray-500 dark:text-gray-400">
            共 {{ summary.total }} 个视频，已完成 {{ summary.done }} 个，缺失 {{ summary.missing }} 个。
          </p>
          <div class="mt-3 flex flex-wrap gap-1.5">
            <UButton
              v-for="item in legend"
              :key="item.key"
              :label="`${item.label} ${item.value}`"
              size="xs"
              :color="item.key === activeStatus ? 'primary' : 'neutral'"
              :variant="item.key === activeStatus ? 'solid' : 'soft'"
              @click="$emit('select', item.key)"
            />
          </div>
        </div>
      </div>

      <div class="min-w-0 flex-1 space-y-2.5 lg:pl-4">
        <div class="flex items-center justify-between text-[11px] font-medium text-gray-500 dark:text-gray-400">
          <span>状态分布</span>
          <span>缺失优先处理</span>
        </div>
        <div class="flex h-3 overflow-hidden rounded-full bg-gray-100 ring-1 ring-inset ring-gray-200/60 dark:bg-gray-800 dark:ring-gray-700/60">
          <div
            v-for="item in visibleLegend"
            :key="item.key"
            class="h-full transition-all duration-500"
            :style="{ width: `${item.percent}%`, backgroundColor: item.color }"
            :title="`${item.label} ${item.value}`"
          />
        </div>
        <div class="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5">
          <div v-for="item in visibleLegend" :key="`stat-${item.key}`" class="rounded-xl bg-gray-50/80 px-2.5 py-2 dark:bg-gray-900/40">
            <p class="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
              <span class="h-1.5 w-1.5 rounded-full" :style="{ backgroundColor: item.color }" />
              {{ item.label }}
            </p>
            <p class="mt-0.5 text-lg font-bold text-gray-900 dark:text-white">{{ item.value }}</p>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
type CoverageStatus = 'done' | 'review' | 'processing' | 'failed' | 'missing'
interface Summary { total: number, done: number, review: number, processing: number, failed: number, missing: number }

const props = defineProps<{
  summary: Summary
  activeStatus?: 'all' | CoverageStatus
}>()

defineEmits<{ select: [status: 'all' | CoverageStatus] }>()

const palette: Array<{ key: CoverageStatus, label: string, color: string }> = [
  { key: 'done', label: '已完成', color: '#10b981' },
  { key: 'review', label: '待核对', color: '#f59e0b' },
  { key: 'processing', label: '处理中', color: '#0ea5e9' },
  { key: 'failed', label: '失败', color: '#ef4444' },
  { key: 'missing', label: '缺失', color: '#f97316' }
]

const legend = computed(() => palette.map(item => {
  const value = Number((props.summary as any)[item.key] || 0)
  return {
    ...item,
    value,
    percent: props.summary.total > 0 ? (value / props.summary.total) * 100 : 0
  }
}))
const visibleLegend = computed(() => legend.value.filter(item => item.value > 0))
const completionRate = computed(() => props.summary.total > 0
  ? Math.round((props.summary.done / props.summary.total) * 100)
  : 0)
const donutBackground = computed(() => {
  if (!props.summary.total) return 'conic-gradient(#e5e7eb 0 100%)'
  let cursor = 0
  const stops = legend.value.map(item => {
    const start = cursor
    cursor += item.percent
    return `${item.color} ${start}% ${cursor}%`
  })
  return `conic-gradient(${stops.join(', ')})`
})
</script>
