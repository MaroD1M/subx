<template>
  <div
    class="review-entry-card space-y-2.5 p-3"
    :class="focused ? 'rounded-2xl bg-warning-50/40 ring-2 ring-warning-400/70 dark:bg-warning-900/10' : ''"
    :style="cardStyle"
  >
    <div class="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
      <div class="min-w-0 space-y-2">
        <div class="flex flex-wrap items-center gap-2">
          <span class="inline-flex" @click.prevent="emit('toggle-select', entry, $event)">
            <UCheckbox :model-value="entry.selected" :aria-label="`选择字幕 #${entry.subtitleId}`" />
          </span>
          <UButton icon="i-lucide-arrow-up" variant="ghost" size="xs" color="neutral" title="上移" aria-label="上移" @click="emit('move-up', entry)" />
          <UButton icon="i-lucide-arrow-down" variant="ghost" size="xs" color="neutral" title="下移" aria-label="下移" @click="emit('move-down', entry)" />
          <UBadge size="sm" color="neutral" variant="soft">#{{ entry.subtitleId }}</UBadge>
          <UBadge size="sm" :color="reviewStatusColor(entry.reviewStatus)" variant="soft">{{ reviewStatusLabel(entry.reviewStatus) }}</UBadge>
          <UBadge v-if="entry.asrConfidence != null" size="sm" :color="Number(entry.asrConfidence) < 0.6 ? 'warning' : 'success'" variant="subtle">
            ASR {{ (Number(entry.asrConfidence) * 100).toFixed(0) }}%
          </UBadge>
          <UBadge v-if="entry.qualityScore != null" size="sm" :color="Number(entry.qualityScore) < qualityThreshold ? 'warning' : 'success'" variant="subtle">
            质量 {{ (Number(entry.qualityScore) * 100).toFixed(0) }}%
          </UBadge>
          <UBadge v-if="isReviewTranslationEmpty(entry)" size="sm" color="error" variant="subtle">译文为空</UBadge>
          <UBadge v-else-if="isReviewSameAsSource(entry)" size="sm" color="warning" variant="subtle">译文与原文相同</UBadge>
          <UBadge v-if="isReviewFinalDiffersFromTranslation(entry)" size="sm" color="info" variant="subtle">导出已调整</UBadge>
          <UBadge v-else-if="isReviewFinalSameAsSource(entry) && !isReviewSameAsSource(entry)" size="sm" color="neutral" variant="subtle">导出=原文</UBadge>
          <UBadge
            v-if="proofreadIssues.length"
            size="sm"
            color="warning"
            variant="subtle"
            :title="proofreadIssues.map((issue: any) => `${issue.type}: ${issue.message}`).join('\n')"
          >
            AI 校对 {{ proofreadIssues.length }}
          </UBadge>
          <UPopover v-model:open="timeOpen" :content="{ align: 'start' }">
            <UButton
              icon="i-lucide-clock"
              size="xs"
              color="neutral"
              variant="ghost"
              :label="`${entry.startTime} → ${entry.endTime}`"
              title="点击编辑此条时间"
              aria-label="编辑字幕时间"
            />
            <template #content>
              <div class="w-72 max-w-[calc(100vw-2rem)] space-y-2 p-3">
                <p class="app-section-title">编辑时间</p>
                <div class="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <UFormField label="开始时间">
                    <UInput v-model="draftStart" size="sm" placeholder="00:00:00,000" class="w-full" />
                  </UFormField>
                  <UFormField label="结束时间">
                    <UInput v-model="draftEnd" size="sm" placeholder="00:00:00,000" class="w-full" />
                  </UFormField>
                </div>
                <div class="flex flex-wrap gap-1">
                  <UButton
                    v-for="nudge in timeNudges"
                    :key="nudge.delta"
                    :label="nudge.label"
                    size="xs"
                    color="neutral"
                    variant="soft"
                    @click="nudgeTime(nudge.delta)"
                  />
                </div>
                <p v-if="timeError" class="text-xs text-red-600 dark:text-red-400">{{ timeError }}</p>
                <div class="flex justify-end gap-1">
                  <UButton label="取消" size="xs" color="neutral" variant="ghost" @click="timeOpen = false" />
                  <UButton label="应用" size="xs" color="primary" @click="applyTime" />
                </div>
              </div>
            </template>
          </UPopover>
        </div>
        <div class="flex flex-wrap gap-1.5">
          <UBadge v-for="reason in entry.reviewReasons" :key="reason" size="xs" color="warning" variant="subtle">{{ reviewReasonLabel(reason) }}</UBadge>
          <UBadge v-for="issue in entry.qualityIssues" :key="`quality-${issue}`" size="xs" color="error" variant="subtle">{{ qualityIssueLabel(issue) }}</UBadge>
        </div>
      </div>
      <div class="flex items-center gap-1">
        <UButton icon="i-lucide-play" size="xs" color="neutral" variant="ghost" :aria-label="`播放片段 #${entry.subtitleId}`" title="播放音频片段" @click="emit('play', entry)" />
        <UButton label="重译" size="xs" color="primary" variant="ghost" :loading="retranslating" title="重译此条；会覆盖当前译文和最终导出" @click="emit('retranslate', entry)" />
      </div>
    </div>

    <div class="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,0.9fr)_minmax(0,1.2fr)]">
      <div class="surface-muted space-y-1.5 p-3">
        <p class="stat-label">原文</p>
        <p class="whitespace-pre-wrap break-words text-sm leading-6 text-gray-800 dark:text-gray-100">{{ entry.originalText }}</p>
      </div>
      <div class="surface-muted space-y-1.5 p-3">
        <div class="flex items-center justify-between gap-1">
          <p class="stat-label" title="AI 当前译文；重译会覆盖此列">当前译文</p>
          <div class="flex items-center gap-0.5">
            <UButton icon="i-lucide-chevron-up" variant="ghost" size="xs" color="neutral" title="译文上移" aria-label="译文上移" @click="emit('shift-translation', entry, -1)" />
            <UButton icon="i-lucide-chevron-down" variant="ghost" size="xs" color="neutral" title="译文下移" aria-label="译文下移" @click="emit('shift-translation', entry, 1)" />
          </div>
        </div>
        <p class="whitespace-pre-wrap break-words text-sm leading-6 text-gray-800 dark:text-gray-100">{{ entry.translatedText || '—' }}</p>
      </div>
      <div class="space-y-2 rounded-xl border border-primary-100 bg-white p-3 dark:border-primary-900/40 dark:bg-gray-950/60">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <p class="stat-label" title="此列内容会写入最终字幕文件"><span class="text-primary-700 dark:text-primary-300">最终导出</span></p>
          <div class="flex items-center gap-0.5">
            <UButton icon="i-lucide-chevron-up" variant="ghost" size="xs" color="primary" title="最终导出上移" aria-label="最终导出上移" @click="emit('shift-final', entry, -1)" />
            <UButton icon="i-lucide-chevron-down" variant="ghost" size="xs" color="primary" title="最终导出下移" aria-label="最终导出下移" @click="emit('shift-final', entry, 1)" />
            <UButton label="恢复译文" size="xs" color="primary" variant="ghost" @click="emit('restore-translated', entry)" />
            <UButton label="使用原文" size="xs" color="neutral" variant="ghost" @click="emit('use-original', entry)" />
          </div>
        </div>
        <UTextarea
          :model-value="entry.finalText"
          :rows="4"
          autoresize
          :maxrows="8"
          class="w-full"
          :aria-label="`最终导出 #${entry.subtitleId}`"
          placeholder="此列内容会写入字幕文件"
          @update:model-value="value => emit('update-final', entry, value)"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import {
  isReviewFinalDiffersFromTranslation,
  isReviewFinalSameAsSource,
  isReviewSameAsSource,
  isReviewTranslationEmpty
} from '~~/shared/reviewFilters'
import {
  qualityIssueLabel,
  reviewReasonLabel,
  reviewStatusColor,
  reviewStatusLabel
} from '~~/shared/reviewLabels'

const props = defineProps<{
  entry: any
  focused: boolean
  proofreadIssues: any[]
  qualityThreshold: number
  retranslating: boolean
}>()

const cardStyle = computed(() => props.focused
  ? { contentVisibility: 'visible' as const }
  : {
      contentVisibility: 'auto' as const,
      containIntrinsicSize: 'auto 200px'
    })

const timeOpen = ref(false)
const draftStart = ref(String(props.entry?.startTime || ''))
const draftEnd = ref(String(props.entry?.endTime || ''))
const timeError = ref('')
const timeNudges = [
  { label: '-0.5s', delta: -0.5 },
  { label: '-0.1s', delta: -0.1 },
  { label: '+0.1s', delta: 0.1 },
  { label: '+0.5s', delta: 0.5 }
]

function parseSrtTime(value: string): number | null {
  const match = String(value || '').trim().match(/^(\d+):(\d{2}):(\d{2})[,.](\d{1,3})$/)
  if (!match) return null
  const hours = Number(match[1])
  const minutes = Number(match[2])
  const seconds = Number(match[3])
  if (minutes > 59 || seconds > 59) return null
  const milliseconds = Number(String(match[4]).padEnd(3, '0').slice(0, 3))
  return hours * 3600 + minutes * 60 + seconds + milliseconds / 1000
}

function formatSrtTime(value: number): string {
  const totalMs = Math.max(0, Math.round(Number(value || 0) * 1000))
  const hours = Math.floor(totalMs / 3600000)
  const minutes = Math.floor((totalMs % 3600000) / 60000)
  const seconds = Math.floor((totalMs % 60000) / 1000)
  const milliseconds = totalMs % 1000
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')},${String(milliseconds).padStart(3, '0')}`
}

function resetTimeDraft() {
  draftStart.value = String(props.entry?.startTime || '')
  draftEnd.value = String(props.entry?.endTime || '')
  timeError.value = ''
}

function nudgeTime(delta: number) {
  const start = parseSrtTime(draftStart.value)
  const end = parseSrtTime(draftEnd.value)
  if (start == null || end == null) {
    timeError.value = '时间格式应为 HH:MM:SS,mmm 或 HH:MM:SS.mmm'
    return
  }
  if (start + delta < 0) {
    timeError.value = '开始时间不能小于 0'
    return
  }
  draftStart.value = formatSrtTime(start + delta)
  draftEnd.value = formatSrtTime(end + delta)
  timeError.value = ''
}

function applyTime() {
  const start = parseSrtTime(draftStart.value)
  const end = parseSrtTime(draftEnd.value)
  if (start == null || end == null) {
    timeError.value = '时间格式应为 HH:MM:SS,mmm 或 HH:MM:SS.mmm'
    return
  }
  if (end <= start) {
    timeError.value = '结束时间必须晚于开始时间'
    return
  }
  timeError.value = ''
  emit('update-time', props.entry, formatSrtTime(start), formatSrtTime(end))
  timeOpen.value = false
}

watch(timeOpen, (open) => {
  if (open) resetTimeDraft()
})

const emit = defineEmits<{
  'toggle-select': [entry: any, event: MouseEvent]
  'move-up': [entry: any]
  'move-down': [entry: any]
  'play': [entry: any]
  'retranslate': [entry: any]
  'shift-translation': [entry: any, direction: number]
  'shift-final': [entry: any, direction: number]
  'restore-translated': [entry: any]
  'use-original': [entry: any]
  'update-final': [entry: any, value: string]
  'update-time': [entry: any, startTime: string, endTime: string]
}>()
</script>
