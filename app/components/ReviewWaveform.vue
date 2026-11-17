<template>
  <section class="surface-card space-y-1.5 p-2.5" aria-label="字幕波形与时间轴">
    <div class="flex items-center gap-2">
      <UIcon name="i-lucide-audio-waveform" class="h-4 w-4 shrink-0 text-primary-600 dark:text-primary-400" />
      <p class="min-w-0 flex-1 truncate text-xs font-medium">
        <template v-if="focusedEntry">#{{ focusedEntry.subtitleId }} · {{ formatTime(focusedStartMs / 1000) }} → {{ formatTime(focusedEndMs / 1000) }}</template>
        <template v-else>波形</template>
      </p>
      <UButton v-for="option in windowOptions" :key="option.value" :label="option.label" size="xs" :color="windowSeconds === option.value ? 'primary' : 'neutral'" :variant="windowSeconds === option.value ? 'solid' : 'ghost'" @click="windowSeconds = option.value" />
      <UIcon name="i-lucide-move-horizontal" class="h-4 w-4 shrink-0 text-gray-400" title="拖动高亮字幕边界调整时间" aria-label="拖动高亮字幕边界调整时间" />
      <UButton icon="i-lucide-refresh-cw" size="xs" color="neutral" variant="ghost" :loading="loading" aria-label="刷新波形" title="刷新波形" @click="loadWaveform" />
    </div>
    <div v-if="error" class="app-info-warning p-2 text-xs">{{ error }}</div>
    <div class="relative overflow-hidden rounded-lg bg-gray-950/90" @mousedown="onMouseDown" @mousemove="onMouseMove" @mouseup="onMouseUp" @mouseleave="onMouseUp">
      <canvas ref="canvasRef" class="block h-16 w-full cursor-crosshair touch-none" aria-label="字幕音频波形" />
      <div v-if="loading" class="pointer-events-none absolute inset-0 flex items-center justify-center text-xs text-gray-300">
        <UIcon name="i-lucide-loader-2" class="mr-1 h-3.5 w-3.5 animate-spin" /> 正在生成波形...
      </div>
      <div v-if="tooltip" class="pointer-events-none absolute top-1 rounded bg-black/70 px-1.5 py-0.5 text-[10px] text-white" :style="{ left: `${tooltip.x}px` }">{{ tooltip.text }}</div>
    </div>
  </section>
</template>

<script setup lang="ts">
const props = defineProps<{
  taskId: string
  entries: any[]
  focusedSubtitleId: string
}>()

const emit = defineEmits<{
  seek: [seconds: number]
  'update:time': [payload: { subtitleId: string, startTime: string, endTime: string }]
}>()

const canvasRef = ref<HTMLCanvasElement | null>(null)
const loading = ref(false)
const error = ref('')
const peaks = ref<Array<[number, number]>>([])
const windowStart = ref(0)
const windowEnd = ref(300)
const windowSeconds = ref(300)
const windowOptions = [{ label: '2m', value: 120 }, { label: '5m', value: 300 }, { label: '10m', value: 600 }]
const tooltip = ref<{ x: number, text: string } | null>(null)
const dragMode = ref<'start' | 'end' | null>(null)
const dragStartSeconds = ref(0)
const dragEndSeconds = ref(0)
let resizeObserver: ResizeObserver | null = null
let requestId = 0

function parseTime(value: unknown) {
  const match = String(value || '').match(/(\d+):(\d+):(\d+)[,.](\d+)/)
  if (!match) return 0
  return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]) + Number(String(match[4] || '').padEnd(3, '0').slice(0, 3)) / 1000
}

function formatTime(seconds: number) {
  const totalMs = Math.max(0, Math.round(seconds * 1000))
  const h = Math.floor(totalMs / 3600000)
  const m = Math.floor((totalMs % 3600000) / 60000)
  const s = Math.floor((totalMs % 60000) / 1000)
  const ms = totalMs % 1000
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms).padStart(3, '0')}`
}

const focusedEntry = computed(() => {
  const target = props.focusedSubtitleId || String(props.entries[0]?.subtitleId || '')
  return props.entries.find(entry => String(entry.subtitleId) === target) || props.entries[0]
})
const focusedStartMs = computed(() => dragMode.value ? dragStartSeconds.value : parseTime(focusedEntry.value?.startTime) * 1000)
const focusedEndMs = computed(() => dragMode.value ? dragEndSeconds.value : parseTime(focusedEntry.value?.endTime) * 1000)

function layoutWindow() {
  const start = parseTime(focusedEntry.value?.startTime)
  const size = windowSeconds.value
  const nextStart = Math.max(0, start - Math.min(60, size / 4))
  windowStart.value = nextStart
  windowEnd.value = nextStart + size
}

async function loadWaveform() {
  if (!import.meta.client || !focusedEntry.value) return
  layoutWindow()
  const current = ++requestId
  loading.value = true
  error.value = ''
  try {
    const result: any = await $fetch(`/api/tasks/${props.taskId}/waveform`, {
      query: { start: windowStart.value, end: windowEnd.value, buckets: 900 }
    })
    if (current !== requestId) return
    peaks.value = Array.isArray(result?.buckets) ? result.buckets : []
    draw()
  } catch (e: any) {
    if (current !== requestId) return
    error.value = e?.data?.message || e?.message || '波形加载失败'
    peaks.value = []
    draw()
  } finally {
    if (current === requestId) loading.value = false
  }
}

function draw() {
  const canvas = canvasRef.value
  if (!canvas) return
  const rect = canvas.getBoundingClientRect()
  const dpr = window.devicePixelRatio || 1
  if (canvas.width !== Math.floor(rect.width * dpr) || canvas.height !== Math.floor(rect.height * dpr)) {
    canvas.width = Math.floor(rect.width * dpr)
    canvas.height = Math.floor(rect.height * dpr)
  }
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  const width = rect.width
  const height = rect.height
  ctx.clearRect(0, 0, width, height)
  ctx.fillStyle = 'rgba(15,23,42,0.95)'
  ctx.fillRect(0, 0, width, height)

  const span = Math.max(1, windowEnd.value - windowStart.value)
  const timeToX = (time: number) => ((time - windowStart.value) / span) * width

  for (const entry of props.entries) {
    const start = parseTime(entry.startTime)
    const end = parseTime(entry.endTime)
    if (end < windowStart.value || start > windowEnd.value) continue
    const x1 = timeToX(start)
    const x2 = timeToX(end)
    const focused = String(entry.subtitleId) === String(focusedEntry.value?.subtitleId)
    ctx.fillStyle = focused ? 'rgba(20,184,166,0.25)' : 'rgba(148,163,184,0.10)'
    ctx.fillRect(x1, 0, Math.max(1, x2 - x1), height)
    ctx.fillStyle = focused ? 'rgba(45,212,191,0.9)' : 'rgba(148,163,184,0.35)'
    ctx.fillRect(x1, height - 3, Math.max(1, x2 - x1), 2)
  }

  if (peaks.value.length) {
    const step = width / peaks.value.length
    ctx.fillStyle = 'rgba(94,234,212,0.8)'
    for (let index = 0; index < peaks.value.length; index++) {
      const [min, max] = peaks.value[index]!
      const x = index * step
      const y1 = height / 2 - max * (height * 0.42)
      const y2 = height / 2 - min * (height * 0.42)
      ctx.fillRect(x, y1, Math.max(1, step), Math.max(1, y2 - y1))
    }
  }

  const start = dragMode.value === 'start' ? dragStartSeconds.value : parseTime(focusedEntry.value?.startTime)
  const end = dragMode.value === 'end' ? dragEndSeconds.value : parseTime(focusedEntry.value?.endTime)
  for (const [time, color] of [[start, '#fbbf24'], [end, '#fb7185']] as const) {
    const x = timeToX(time)
    if (x < -2 || x > width + 2) continue
    ctx.strokeStyle = color
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(x, 0)
    ctx.lineTo(x, height)
    ctx.stroke()
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.arc(x, height / 2, 4, 0, Math.PI * 2)
    ctx.fill()
  }
}

function eventX(event: MouseEvent) {
  const rect = canvasRef.value?.getBoundingClientRect()
  return rect ? Math.max(0, Math.min(rect.width, event.clientX - rect.left)) : 0
}

function xToSeconds(x: number) {
  const rect = canvasRef.value?.getBoundingClientRect()
  if (!rect || rect.width <= 0) return windowStart.value
  return windowStart.value + (x / rect.width) * (windowEnd.value - windowStart.value)
}

function onMouseDown(event: MouseEvent) {
  if (!focusedEntry.value) return
  const x = eventX(event)
  const start = parseTime(focusedEntry.value.startTime)
  const end = parseTime(focusedEntry.value.endTime)
  const tolerance = (windowEnd.value - windowStart.value) / Math.max(1, canvasRef.value?.getBoundingClientRect().width || 1) * 8
  const clicked = xToSeconds(x)
  if (Math.abs(clicked - start) <= tolerance) {
    dragMode.value = 'start'
    dragStartSeconds.value = start * 1000
    dragEndSeconds.value = end * 1000
  } else if (Math.abs(clicked - end) <= tolerance) {
    dragMode.value = 'end'
    dragStartSeconds.value = start * 1000
    dragEndSeconds.value = end * 1000
  } else {
    emit('seek', clicked)
  }
}

function onMouseMove(event: MouseEvent) {
  if (!focusedEntry.value) return
  const x = eventX(event)
  const seconds = xToSeconds(x)
  tooltip.value = { x, text: formatTime(seconds) }
  if (!dragMode.value) return
  if (dragMode.value === 'start') {
    dragStartSeconds.value = Math.min(seconds * 1000, dragEndSeconds.value - 50)
  } else {
    dragEndSeconds.value = Math.max(seconds * 1000, dragStartSeconds.value + 50)
  }
  draw()
}

function onMouseUp() {
  if (!dragMode.value || !focusedEntry.value) {
    dragMode.value = null
    return
  }
  const mode = dragMode.value
  dragMode.value = null
  const start = mode === 'start' ? dragStartSeconds.value / 1000 : parseTime(focusedEntry.value.startTime)
  const end = mode === 'end' ? dragEndSeconds.value / 1000 : parseTime(focusedEntry.value.endTime)
  if (end <= start) return
  emit('update:time', {
    subtitleId: String(focusedEntry.value.subtitleId),
    startTime: formatTime(start),
    endTime: formatTime(end)
  })
  draw()
}

watch(() => [focusedEntry.value?.subtitleId, focusedEntry.value?.startTime, focusedEntry.value?.endTime, windowSeconds.value], () => {
  void loadWaveform()
}, { immediate: true })

watch(peaks, () => draw())

onMounted(() => {
  resizeObserver = new ResizeObserver(() => draw())
  if (canvasRef.value) resizeObserver.observe(canvasRef.value)
})

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  resizeObserver = null
})
</script>
