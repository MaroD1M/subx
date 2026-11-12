<template>
  <section class="app-card overflow-hidden">
    <component
      :is="collapsible ? 'button' : 'div'"
      :type="collapsible ? 'button' : undefined"
      class="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left transition-colors sm:px-4"
      :class="collapsible ? 'hover:bg-gray-50/80 dark:hover:bg-gray-900/40' : ''"
      :aria-expanded="collapsible ? expanded : undefined"
      @click="collapsible ? toggleExpanded() : undefined"
    >
      <div class="flex min-w-0 flex-1 flex-col gap-1.5">
        <div class="flex flex-wrap items-center gap-x-3 gap-y-1">
          <p class="text-sm font-semibold text-gray-900 dark:text-white">
            字幕覆盖 <span class="text-base font-black tabular-nums">{{ completionRate }}%</span>
          </p>
          <div class="flex flex-wrap items-center gap-1.5">
            <span class="app-pill app-pill-success">已完成 {{ summary.done }}</span>
            <span class="app-pill app-pill-missing">缺失 {{ summary.missing }}</span>
            <span v-if="summary.review" class="app-pill app-pill-warning">待核对 {{ summary.review }}</span>
            <span v-if="summary.failed" class="app-pill app-pill-error">失败 {{ summary.failed }}</span>
            <span v-if="summary.processing" class="app-pill app-pill-info">处理中 {{ summary.processing }}</span>
            <span class="app-meta tabular-nums">共 {{ summary.total }} 个</span>
          </div>
        </div>
        <div class="flex items-center gap-2">
          <div class="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800 sm:max-w-64">
            <div class="h-full rounded-full bg-emerald-500 transition-all" :style="{ width: `${completionRate}%` }" />
          </div>
          <span class="app-meta shrink-0">{{ summary.missing ? `缺失 ${summary.missing} 个优先处理` : '全部已完成' }}</span>
        </div>
      </div>
      <UIcon
        v-if="collapsible"
        :name="expanded ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'"
        class="h-4 w-4 shrink-0 text-gray-500 dark:text-gray-400"
      />
    </component>

    <div
      v-if="expanded"
      class="flex flex-col gap-3 border-t border-gray-100 px-3 py-3 dark:border-gray-800 sm:px-4 lg:flex-row lg:items-center"
    >
      <div class="flex items-center gap-3">
        <div class="relative h-16 w-16 shrink-0">
          <div class="h-full w-full rounded-full" :style="{ background: donutBackground }" />
          <div class="absolute inset-[8px] flex flex-col items-center justify-center rounded-full bg-white text-center shadow-inner dark:bg-gray-950">
            <span class="text-base font-black tracking-tight text-gray-900 dark:text-white">{{ completionRate }}%</span>
            <span class="text-[11px] font-semibold uppercase tracking-widest text-gray-500 dark:text-gray-400">已覆盖</span>
          </div>
        </div>
        <div class="min-w-0">
          <p class="app-caption">
            共 {{ summary.total }} 个视频，已完成 {{ summary.done }} 个，缺失 {{ summary.missing }} 个。
          </p>
          <div class="mt-1.5 flex flex-wrap gap-1">
            <UButton
              v-for="item in legend"
              :key="item.key"
              :label="`${item.label} ${item.value}`"
              size="xs"
              :color="item.key === activeStatus ? 'primary' : 'neutral'"
              :variant="item.key === activeStatus ? 'solid' : 'soft'"
              @click.stop="$emit('select', item.key)"
            />
          </div>
        </div>
      </div>

      <div class="min-w-0 flex-1 space-y-2 lg:pl-3">
        <div class="app-meta flex items-center justify-between font-medium">
          <span>状态分布</span>
          <span>缺失优先处理</span>
        </div>
        <div class="flex h-2 overflow-hidden rounded-full bg-gray-100 ring-1 ring-inset ring-gray-200/60 dark:bg-gray-800 dark:ring-gray-700/60">
          <div
            v-for="item in visibleLegend"
            :key="item.key"
            class="h-full transition-all duration-500"
            :style="{ width: `${item.percent}%`, backgroundColor: item.color }"
            :title="`${item.label} ${item.value}`"
          />
        </div>
        <div class="app-stat-grid gap-1.5 xl:grid-cols-5">
          <div v-for="item in visibleLegend" :key="`stat-${item.key}`" class="app-stat py-2">
            <p class="app-stat-label flex items-center gap-1">
              <span class="h-1.5 w-1.5 rounded-full" :style="{ backgroundColor: item.color }" />
              {{ item.label }}
            </p>
            <p class="app-stat-value mt-0.5 text-base">{{ item.value }}</p>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
type CoverageStatus = 'done' | 'review' | 'processing' | 'failed' | 'missing'
interface Summary { total: number, done: number, review: number, processing: number, failed: number, missing: number }

const props = withDefaults(defineProps<{
  summary: Summary
  activeStatus?: 'all' | CoverageStatus
  collapsible?: boolean
  defaultExpanded?: boolean
}>(), {
  collapsible: true,
  defaultExpanded: false
})

defineEmits<{ select: [status: 'all' | CoverageStatus] }>()

const expanded = ref(!props.collapsible || props.defaultExpanded)

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

function toggleExpanded() {
  expanded.value = !expanded.value
}
</script>
