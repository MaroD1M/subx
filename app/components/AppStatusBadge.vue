<template>
  <UBadge :color="color" variant="subtle" size="sm" class="whitespace-nowrap">
    {{ label || STATUS_LABELS[status] || status }}
  </UBadge>
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

const STATUS_COLORS: Record<string, 'primary' | 'success' | 'warning' | 'error' | 'neutral' | 'info'> = {
  queued: 'neutral',
  pending: 'neutral',
  received: 'info',
  probing: 'info',
  extracting: 'info',
  extracting_audio: 'info',
  transcribing: 'info',
  paused: 'warning',
  ocr: 'info',
  parsing: 'info',
  translating: 'primary',
  exporting: 'primary',
  processing: 'primary',
  running: 'primary',
  review: 'warning',
  done: 'success',
  error: 'error',
  failed: 'error',
  cancelled: 'neutral',
  skipped: 'neutral',
  ignored: 'neutral',
  sent: 'success'
}

const color = computed(() => STATUS_COLORS[props.status] || 'neutral')
</script>
