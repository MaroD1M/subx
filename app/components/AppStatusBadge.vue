<template>
  <span class="app-pill whitespace-nowrap" :class="pillClass">
    {{ label || STATUS_LABELS[status] || status }}
  </span>
</template>

<script setup lang="ts">
const props = defineProps<{
  status: string
  label?: string
}>()

const STATUS_LABELS: Record<string, string> = {
  queued: '排队中',
  pending: '等待中',
  received: '已接收',
  probing: '分析媒体',
  extracting: '提取字幕',
  extracting_audio: '提取音频',
  transcribing: '语音识别',
  paused: '已暂停',
  ocr: '图像字幕 OCR',
  parsing: '解析分块',
  translating: '翻译中',
  exporting: '导出中',
  processing: '处理中',
  running: '运行中',
  review: '待核对',
  done: '已完成',
  error: '失败',
  failed: '失败',
  cancelled: '已取消',
  skipped: '已跳过',
  ignored: '已忽略',
  sent: '已发送'
}

const STATUS_PILLS: Record<string, string> = {
  queued: 'app-pill-neutral',
  pending: 'app-pill-neutral',
  received: 'app-pill-info',
  probing: 'app-pill-info',
  extracting: 'app-pill-info',
  extracting_audio: 'app-pill-info',
  transcribing: 'app-pill-info',
  paused: 'app-pill-warning',
  ocr: 'app-pill-info',
  parsing: 'app-pill-info',
  translating: 'app-pill-primary',
  exporting: 'app-pill-primary',
  processing: 'app-pill-primary',
  running: 'app-pill-primary',
  review: 'app-pill-warning',
  done: 'app-pill-success',
  error: 'app-pill-error',
  failed: 'app-pill-error',
  cancelled: 'app-pill-neutral',
  skipped: 'app-pill-neutral',
  ignored: 'app-pill-neutral',
  sent: 'app-pill-success'
}

const pillClass = computed(() => STATUS_PILLS[props.status] || 'app-pill-neutral')
</script>
