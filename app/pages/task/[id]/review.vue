<template>
  <div class="max-w-[1600px] mx-auto py-8 space-y-6">
    <div class="flex items-start justify-between gap-4 flex-wrap">
      <div>
        <p class="text-xs font-semibold tracking-widest text-warning-500 uppercase">Subtitle Review</p>
        <h1 class="text-2xl font-bold text-gray-900 dark:text-white mt-1">字幕核对</h1>
        <p class="text-sm text-gray-500 dark:text-gray-400 mt-2">支持批量重译、手动修正与最终字幕实时预览。</p>
      </div>
      <div class="flex items-center gap-2 flex-wrap">
        <UButton label="返回任务" color="neutral" variant="ghost" :to="`/task/${taskId}`" />
        <UButton label="放弃成果" color="error" variant="soft" @click="discardReview" />
        <UButton label="导出结果" color="primary" :loading="exporting" @click="exportReviewed" />
      </div>
    </div>

    <div class="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_420px] gap-6 items-start">
      <div class="space-y-6 min-w-0">
        <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div class="rounded-2xl border border-gray-100 dark:border-gray-800 bg-white/80 dark:bg-gray-900/40 p-4">
            <p class="text-[10px] uppercase tracking-widest text-gray-400">总条数</p>
            <p class="mt-2 text-2xl font-bold text-gray-900 dark:text-white">{{ summary.total }}</p>
          </div>
          <div class="rounded-2xl border border-amber-100 dark:border-amber-900/40 bg-amber-50/70 dark:bg-amber-900/10 p-4">
            <p class="text-[10px] uppercase tracking-widest text-amber-500">待核对</p>
            <p class="mt-2 text-2xl font-bold text-amber-700 dark:text-amber-300">{{ summary.needsReview }}</p>
          </div>
          <div class="rounded-2xl border border-blue-100 dark:border-blue-900/40 bg-blue-50/70 dark:bg-blue-900/10 p-4">
            <p class="text-[10px] uppercase tracking-widest text-blue-500">已编辑</p>
            <p class="mt-2 text-2xl font-bold text-blue-700 dark:text-blue-300">{{ summary.edited }}</p>
          </div>
          <div class="rounded-2xl border border-gray-100 dark:border-gray-800 bg-white/80 dark:bg-gray-900/40 p-4 flex flex-col gap-2">
            <USelect v-model="statusFilter" :items="filterItems" class="w-full" />
            <UButton label="仅选待核对" color="neutral" variant="ghost" @click="selectNeedsReview" />
          </div>
        </div>

        <div class="rounded-3xl border border-gray-100 dark:border-gray-800 bg-white/80 dark:bg-gray-950/30 overflow-hidden">
          <div class="px-4 py-3 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between gap-3 flex-wrap">
            <div class="text-sm text-gray-500 dark:text-gray-400">{{ filteredEntries.length }} 条可见，已选 {{ selectedEntries.length }} 条</div>
            <div class="flex items-center gap-2 flex-wrap">
              <UButton label="批量重译" size="xs" color="primary" variant="soft" :loading="retranslating" @click="retranslateSelected" />
              <UButton label="批量设为原文" size="xs" color="warning" variant="ghost" @click="applyBulkOriginal" />
              <UButton label="保存修改" size="xs" color="neutral" :loading="saving" @click="saveChanges" />
            </div>
          </div>

          <div class="divide-y divide-gray-100 dark:divide-gray-800 max-h-[70vh] overflow-y-auto">
            <div v-for="entry in filteredEntries" :key="entry.subtitleId" class="p-4 space-y-3">
              <div class="flex items-start justify-between gap-4">
                <div class="min-w-0">
                  <div class="flex items-center gap-2 flex-wrap">
                    <UBadge size="sm" color="neutral" variant="soft">#{{ entry.subtitleId }}</UBadge>
                    <UBadge size="sm" :color="statusColor(entry.reviewStatus)" variant="soft">{{ statusLabel(entry.reviewStatus) }}</UBadge>
                    <span class="text-xs text-gray-400">{{ entry.startTime }} → {{ entry.endTime }}</span>
                  </div>
                  <div v-if="entry.reviewReasons?.length" class="mt-2 flex flex-wrap gap-1.5">
                    <UBadge v-for="reason in entry.reviewReasons" :key="reason" size="xs" color="warning" variant="subtle">{{ reason }}</UBadge>
                  </div>
                </div>
                <div class="flex items-center gap-2">
                  <UButton label="重译" size="xs" color="primary" variant="ghost" :loading="retranslatingSingleId === entry.subtitleId" @click="retranslateSingle(entry)" />
                  <UCheckbox v-model="entry.selected" />
                </div>
              </div>

              <div class="grid grid-cols-1 lg:grid-cols-3 gap-3">
                <div class="rounded-2xl bg-gray-50 dark:bg-gray-900/60 p-3">
                  <p class="text-[10px] uppercase tracking-widest text-gray-400 mb-2">原文</p>
                  <p class="text-sm whitespace-pre-wrap break-words text-gray-800 dark:text-gray-100">{{ entry.originalText }}</p>
                </div>
                <div class="rounded-2xl bg-gray-50 dark:bg-gray-900/60 p-3">
                  <p class="text-[10px] uppercase tracking-widest text-gray-400 mb-2">当前译文</p>
                  <p class="text-sm whitespace-pre-wrap break-words text-gray-800 dark:text-gray-100">{{ entry.translatedText || '—' }}</p>
                </div>
                <div class="rounded-2xl bg-white dark:bg-gray-950/60 border border-primary-100 dark:border-primary-900/40 p-3 space-y-2">
                  <div class="flex items-center justify-between gap-2">
                    <p class="text-[10px] uppercase tracking-widest text-primary-500">最终导出文本</p>
                    <UButton label="使用原文" size="xs" color="neutral" variant="ghost" @click="useOriginal(entry)" />
                  </div>
                  <UTextarea v-model="entry.finalText" :rows="4" autoresize @update:model-value="markEdited(entry)" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="rounded-3xl border border-gray-100 dark:border-gray-800 bg-white/80 dark:bg-gray-950/30 overflow-hidden sticky top-6">
        <div class="px-4 py-3 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between gap-2">
          <div>
            <p class="text-sm font-semibold text-gray-800 dark:text-gray-100">最终字幕预览</p>
            <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">基于当前核对结果实时生成预览。</p>
          </div>
          <UButton label="刷新" size="xs" color="neutral" variant="ghost" :loading="previewLoading" @click="loadPreview" />
        </div>
        <div class="px-4 pt-3 flex items-center justify-between gap-2">
          <USelect v-model="previewFormat" :items="previewFormatItems" class="w-32" />
          <span class="text-[11px] text-gray-400">{{ previewFormat === 'ass' ? '样式化 ASS 预览' : '标准 SRT 预览' }}</span>
        </div>
        <div class="p-4">
          <div v-if="previewLoading" class="text-xs text-gray-400 flex items-center gap-2"><UIcon name="i-lucide-loader-2" class="w-4 h-4 animate-spin" /> 正在生成预览...</div>
          <pre v-else class="text-xs leading-6 whitespace-pre-wrap break-words max-h-[70vh] overflow-y-auto custom-scrollbar text-gray-800 dark:text-gray-100">{{ previewContent || '暂无预览内容' }}</pre>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
const route = useRoute()
const taskId = String(route.params.id)
const toast = useToast()
const saving = ref(false)
const exporting = ref(false)
const retranslating = ref(false)
const retranslatingSingleId = ref('')
const previewLoading = ref(false)
const previewContent = ref('')
const previewFormat = ref<'srt' | 'ass'>('srt')
const statusFilter = ref('all')
const summary = reactive({ total: 0, needsReview: 0, edited: 0 })
const entries = ref<any[]>([])

const previewFormatItems = [
  { label: 'SRT', value: 'srt' },
  { label: 'ASS', value: 'ass' }
]

const filterItems = [
  { label: '全部条目', value: 'all' },
  { label: '仅待核对', value: 'needs_review' },
  { label: '仅已编辑', value: 'edited' }
]

const filteredEntries = computed(() => {
  if (statusFilter.value === 'needs_review') {
    return entries.value.filter(entry => ['needs_review', 'fallback_original', 'missing'].includes(entry.reviewStatus))
  }
  if (statusFilter.value === 'edited') {
    return entries.value.filter(entry => entry.edited)
  }
  return entries.value
})

const selectedEntries = computed(() => entries.value.filter(entry => entry.selected))

function statusLabel(status: string) {
  return ({ translated: '已翻译', accepted_same: '同文可接受', needs_review: '需核对', fallback_original: '已回退原文', missing: '缺失', edited: '已编辑' } as any)[status] || status
}

function statusColor(status: string) {
  return ({ translated: 'success', accepted_same: 'primary', needs_review: 'warning', fallback_original: 'error', missing: 'error', edited: 'info' } as any)[status] || 'neutral'
}

function markEdited(entry: any) {
  entry.edited = true
  entry.reviewStatus = 'edited'
}

function useOriginal(entry: any) {
  entry.finalText = entry.originalText
  entry.edited = true
  entry.reviewStatus = 'edited'
}

function selectNeedsReview() {
  for (const entry of entries.value) {
    entry.selected = ['needs_review', 'fallback_original', 'missing'].includes(entry.reviewStatus)
  }
}

function applyBulkOriginal() {
  for (const entry of selectedEntries.value) {
    useOriginal(entry)
  }
}

async function loadReview() {
  const res: any = await $fetch(`/api/tasks/${taskId}/review`)
  summary.total = res.summary.total
  summary.needsReview = res.summary.needsReview
  summary.edited = res.summary.edited
  entries.value = res.entries
}

async function loadPreview() {
  previewLoading.value = true
  try {
    const res: any = await $fetch(`/api/tasks/${taskId}/review-preview`, { query: { format: previewFormat.value } })
    previewContent.value = res.content || ''
  } finally {
    previewLoading.value = false
  }
}

async function saveChanges(showToast = true) {
  saving.value = true
  try {
    await $fetch(`/api/tasks/${taskId}/review`, {
      method: 'PATCH',
      body: {
        entries: entries.value.map(entry => ({
          subtitleId: entry.subtitleId,
          finalText: entry.finalText,
          reviewStatus: entry.reviewStatus,
          selected: entry.selected,
          edited: entry.edited
        }))
      }
    })
    if (showToast) toast.add({ title: '已保存核对结果', color: 'success' })
    await Promise.all([loadReview(), loadPreview()])
  } finally {
    saving.value = false
  }
}

async function retranslateIds(subtitleIds: string[]) {
  if (!subtitleIds.length) return
  const res: any = await $fetch(`/api/tasks/${taskId}/review-retranslate`, {
    method: 'POST',
    body: { subtitleIds }
  })
  const updatedMap = new Map((res.entries || []).map((entry: any) => [String(entry.subtitleId), entry]))
  for (const entry of entries.value) {
    const next = updatedMap.get(String(entry.subtitleId))
    if (!next) continue
    entry.translatedText = next.translatedText
    entry.finalText = next.finalText
    entry.reviewStatus = next.reviewStatus
    entry.reviewReasons = next.reviewReasons
    entry.edited = false
  }
  await loadPreview()
  toast.add({ title: `已重新翻译 ${subtitleIds.length} 条字幕`, color: 'success' })
}

async function retranslateSelected() {
  const ids = selectedEntries.value.map(entry => String(entry.subtitleId))
  if (!ids.length) {
    toast.add({ title: '请先选择要重译的字幕', color: 'warning' })
    return
  }
  retranslating.value = true
  try {
    await saveChanges(false)
    await retranslateIds(ids)
  } finally {
    retranslating.value = false
  }
}

async function retranslateSingle(entry: any) {
  retranslatingSingleId.value = String(entry.subtitleId)
  try {
    await saveChanges(false)
    await retranslateIds([String(entry.subtitleId)])
  } finally {
    retranslatingSingleId.value = ''
  }
}

async function exportReviewed() {
  exporting.value = true
  try {
    await saveChanges(false)
    await $fetch(`/api/tasks/${taskId}/review-export`, { method: 'POST' })
    toast.add({ title: '已导出最终字幕', color: 'success' })
    await navigateTo(`/task/${taskId}`)
  } finally {
    exporting.value = false
  }
}

async function discardReview() {
  await $fetch(`/api/tasks/${taskId}/review-discard`, { method: 'POST' })
  toast.add({ title: '已放弃本次翻译成果', color: 'warning' })
  await navigateTo(`/history`)
}

watch(previewFormat, () => {
  loadPreview()
})

onMounted(async () => {
  await loadReview()
  await loadPreview()
})
</script>
