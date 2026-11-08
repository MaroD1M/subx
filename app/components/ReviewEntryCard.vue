<template>
  <div
    class="space-y-2.5 p-3"
    :class="focused ? 'rounded-2xl bg-warning-50/40 ring-2 ring-warning-400/70 dark:bg-warning-900/10' : ''"
  >
    <div class="flex items-start justify-between gap-3">
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
          <span class="text-[11px] text-gray-500 dark:text-gray-400">{{ entry.startTime }} → {{ entry.endTime }}</span>
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

    <div class="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(180px,0.9fr)_minmax(180px,0.9fr)_minmax(240px,1.2fr)]">
      <div class="space-y-1.5 rounded-2xl bg-gray-50 p-3 dark:bg-gray-900/60">
        <p class="text-[10px] uppercase tracking-widest text-gray-500 dark:text-gray-400">原文</p>
        <p class="whitespace-pre-wrap break-words text-[13px] leading-6 text-gray-800 dark:text-gray-100">{{ entry.originalText }}</p>
      </div>
      <div class="space-y-1.5 rounded-2xl bg-gray-50 p-3 dark:bg-gray-900/60">
        <div class="flex items-center justify-between gap-1">
          <p class="text-[10px] uppercase tracking-widest text-gray-500 dark:text-gray-400" title="AI 当前译文；重译会覆盖此列">当前译文</p>
          <div class="flex items-center gap-0.5">
            <UButton icon="i-lucide-chevron-up" variant="ghost" size="xs" color="neutral" title="译文上移" aria-label="译文上移" @click="emit('shift-translation', entry, -1)" />
            <UButton icon="i-lucide-chevron-down" variant="ghost" size="xs" color="neutral" title="译文下移" aria-label="译文下移" @click="emit('shift-translation', entry, 1)" />
          </div>
        </div>
        <p class="whitespace-pre-wrap break-words text-[13px] leading-6 text-gray-800 dark:text-gray-100">{{ entry.translatedText || '—' }}</p>
      </div>
      <div class="space-y-2 rounded-2xl border border-primary-100 bg-white p-3 dark:border-primary-900/40 dark:bg-gray-950/60">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <p class="text-[10px] uppercase tracking-widest text-primary-700" title="此列内容会写入最终字幕文件">最终导出</p>
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

defineProps<{
  entry: any
  focused: boolean
  proofreadIssues: any[]
  qualityThreshold: number
  retranslating: boolean
}>()

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
}>()
</script>
