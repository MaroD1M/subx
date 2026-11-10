<template>
  <div class="grid grid-cols-2 gap-2 rounded-2xl border border-gray-200/70 bg-gray-50/60 p-3 text-xs dark:border-gray-800 dark:bg-gray-900/30 sm:grid-cols-3 xl:grid-cols-6">
    <div class="min-w-0">
      <p class="stat-label">{{ timingStartLabel }}</p>
      <p class="mt-1 truncate font-medium text-gray-700 dark:text-gray-300" :title="timingStartText">{{ timingStartText }}</p>
    </div>
    <div class="min-w-0">
      <p class="stat-label">{{ timingElapsedLabel }}</p>
      <p class="mt-1 font-medium text-gray-700 dark:text-gray-300">{{ timingElapsedText }}</p>
    </div>
    <div v-if="showStageTiming" class="min-w-0">
      <p class="stat-label">当前阶段</p>
      <p class="mt-1 font-medium text-gray-700 dark:text-gray-300">{{ stageElapsedText }}</p>
    </div>
    <div v-if="!isTerminalTask && !isQueuedTask" class="min-w-0">
      <p class="stat-label">当前阶段预计</p>
      <p class="mt-1 font-medium text-gray-700 dark:text-gray-300">{{ timingStageEtaText }}</p>
    </div>
    <div v-if="!isTerminalTask" class="min-w-0">
      <p class="stat-label">预计剩余</p>
      <p class="mt-1 font-medium text-gray-700 dark:text-gray-300">{{ timingEtaText }}</p>
    </div>
    <div v-if="timingEtaClock && !isTerminalTask" class="min-w-0">
      <p class="stat-label">预计完成</p>
      <p class="mt-1 font-medium text-gray-700 dark:text-gray-300">{{ timingEtaClock }}</p>
    </div>
    <div v-if="isTerminalTask && timingFinishedText" class="min-w-0">
      <p class="stat-label">完成时间</p>
      <p class="mt-1 truncate font-medium text-gray-700 dark:text-gray-300" :title="timingFinishedText">{{ timingFinishedText }}</p>
    </div>
    <div v-if="isTerminalTask && totalElapsedText" class="min-w-0">
      <p class="stat-label">总耗时</p>
      <p class="mt-1 font-medium text-gray-700 dark:text-gray-300">{{ totalElapsedText }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { formatDateTime } from '~~/shared/time'
import {
  computeActiveElapsedMs,
  computeStageElapsedMs,
  computeTaskEtaMs,
  formatDuration,
  smoothEtaMs,
  type TaskProgressSample
} from '~~/shared/taskTiming'

const props = defineProps<{
  task: Record<string, any>
  timeZone: string
}>()

const nowTick = ref(Date.now())
const progressSamples = ref<TaskProgressSample[]>([])
const smoothedOverallEta = ref<number | null>(null)
let timer: ReturnType<typeof setInterval> | null = null

const isQueuedTask = computed(() => props.task.step === 'queued')
const isPausedTask = computed(() => props.task.step === 'paused')
const isTerminalTask = computed(() => ['done', 'error', 'cancelled', 'review'].includes(String(props.task.step || '')))
const timingInput = computed(() => ({
  status: String(props.task.step || ''),
  progress: Number(props.task.progress || 0),
  stepProgress: Number(props.task.stepProgress || 0),
  completedChunks: Number(props.task.completedChunks || 0),
  totalChunks: Number(props.task.totalChunks || 0),
  createdAt: props.task.createdAt,
  updatedAt: props.task.updatedAt,
  startedAt: props.task.startedAt,
  stepStartedAt: props.task.stepStartedAt,
  finishedAt: props.task.finishedAt,
  pausedAt: props.task.pausedAt,
  pausedTotalMs: Number(props.task.pausedTotalMs || 0)
}))
const activeElapsedMs = computed(() => computeActiveElapsedMs(timingInput.value, nowTick.value))
const stageElapsedMs = computed(() => computeStageElapsedMs(timingInput.value, nowTick.value))
const rawEta = computed(() => computeTaskEtaMs(timingInput.value, progressSamples.value, nowTick.value))
const overallEtaMs = computed(() => smoothedOverallEta.value ?? rawEta.value.overallMs)
const stageEtaMs = computed(() => rawEta.value.stageMs)

watch(() => rawEta.value.overallMs, (next) => {
  smoothedOverallEta.value = next == null ? null : smoothEtaMs(smoothedOverallEta.value, next)
})

const timingStartLabel = computed(() => props.task.startedAt ? '开始处理' : '创建时间')
const timingStartText = computed(() => formatDateTime(props.task.startedAt || props.task.createdAt, props.timeZone))
const timingElapsedLabel = computed(() => isQueuedTask.value && !props.task.startedAt ? '已等待' : isPausedTask.value ? '已进行（暂停中）' : '已进行')
const timingElapsedText = computed(() => formatDuration(activeElapsedMs.value))
const stageElapsedText = computed(() => formatDuration(stageElapsedMs.value))
const showStageTiming = computed(() => Boolean(props.task.stepStartedAt) && !isTerminalTask.value && !isPausedTask.value)
const timingEtaText = computed(() => {
  if (isQueuedTask.value) return '等待开始'
  if (isPausedTask.value) return '已暂停'
  if (isTerminalTask.value) return '—'
  const eta = overallEtaMs.value
  return eta == null ? '估算中' : `约 ${formatDuration(eta)}`
})
const timingStageEtaText = computed(() => {
  if (isQueuedTask.value) return '等待开始'
  if (isPausedTask.value) return '已暂停'
  if (isTerminalTask.value) return '—'
  return stageEtaMs.value == null ? '估算中' : `约 ${formatDuration(stageEtaMs.value)}`
})
const timingEtaClock = computed(() => {
  if (isQueuedTask.value || isPausedTask.value || isTerminalTask.value) return ''
  const eta = overallEtaMs.value
  if (eta == null) return ''
  return formatDateTime(new Date(nowTick.value + eta), props.timeZone)
})
const timingFinishedText = computed(() => props.task.finishedAt ? formatDateTime(props.task.finishedAt, props.timeZone) : '')
const totalElapsedText = computed(() => props.task.finishedAt ? formatDuration(activeElapsedMs.value) : '')

function recordProgressSample() {
  const progress = Number(props.task.progress || 0)
  if (!props.task.createdAt || progress <= 0 || isPausedTask.value || isTerminalTask.value) return
  const last = progressSamples.value[progressSamples.value.length - 1]
  const now = Date.now()
  if (!last || last.progress !== progress) {
    progressSamples.value.push({ at: now, progress })
  }
  const cutoff = now - 120_000
  progressSamples.value = progressSamples.value.filter(sample => sample.at >= cutoff)
}

watch(() => props.task.step, () => {
  progressSamples.value = []
  smoothedOverallEta.value = null
})
watch(() => [props.task.step, props.task.progress, props.task.stepProgress], recordProgressSample, { immediate: true })

onMounted(() => {
  timer = setInterval(() => { nowTick.value = Date.now() }, 1000)
})

onUnmounted(() => {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
})
</script>
