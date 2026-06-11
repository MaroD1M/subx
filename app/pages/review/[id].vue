<template>
  <div class="max-w-[1500px] mx-auto py-6 space-y-5">
    <div class="flex items-start justify-between gap-4 flex-wrap">
      <div>
        <p class="text-xs font-semibold tracking-widest text-warning-500 uppercase">字幕核对中心</p>
        <h1 class="text-2xl font-bold text-gray-900 dark:text-white mt-1">字幕核对</h1>
        <p class="text-sm text-gray-500 dark:text-gray-400 mt-2">批量筛选、重译、手动修正，并实时预览最终字幕。</p>
      </div>
      <div class="flex items-center gap-2 flex-wrap">
        <UButton label="返回任务" color="neutral" variant="ghost" :to="`/task/${taskId}`" />
        <UButton label="放弃成果" color="error" variant="soft" @click="discardReview" />
        <UButton label="导出结果" color="primary" :loading="exporting" @click="exportReviewed" />
        <USelect v-model="exportMode" :items="exportModeItems" class="w-28" title="导出模式" />
        <USelect v-model="exportStyle" :items="exportStyleItems" class="w-36" title="字幕样式" />
        <USelect v-model="exportFormat" :items="exportFormatItems" class="w-20" title="导出格式" />
      </div>
    </div>

    <div class="grid grid-cols-2 lg:grid-cols-4 gap-3">
      <div class="surface-card p-4">
        <p class="stat-label">总条数</p>
        <p class="stat-value">{{ summary.total }}</p>
      </div>
      <div class="surface-card p-4 ring-1 ring-amber-200/50 dark:ring-amber-800/30">
        <p class="stat-label text-amber-500">待核对</p>
        <p class="stat-value text-amber-700 dark:text-amber-300">{{ summary.needsReview }}</p>
      </div>
      <div class="surface-card p-4 ring-1 ring-blue-200/50 dark:ring-blue-800/30">
        <p class="stat-label text-blue-500">已编辑</p>
        <p class="stat-value text-blue-700 dark:text-blue-300">{{ summary.edited }}</p>
      </div>
      <div class="surface-card p-4">
        <p class="stat-label">当前可见</p>
        <p class="stat-value">{{ filteredEntries.length }}</p>
      </div>
    </div>

    <div class="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_380px] gap-5 items-start">
      <div class="space-y-4 min-w-0">
        <div class="rounded-3xl border border-gray-100 dark:border-gray-800 bg-white/80 dark:bg-gray-950/30 overflow-hidden">
          <div class="px-4 py-3 border-b border-gray-100 dark:border-gray-800 space-y-3">
            <div class="flex items-center justify-between gap-3 flex-wrap">
              <div class="flex items-center gap-3 flex-wrap text-sm text-gray-500 dark:text-gray-400">
                <span>已选 {{ selectedEntries.length }} 条</span>
                <span v-if="dirtyCount > 0" class="text-primary-500">待保存 {{ dirtyCount }} 条</span>
              </div>
              <div class="flex items-center gap-2 flex-wrap">
                <span class="text-xs text-gray-400">状态筛选</span>
                <USelect v-model="statusFilter" :items="filterItems" class="w-24" size="xs" />
                <span class="text-xs text-gray-400">原因筛选</span>
                <USelect v-model="reasonFilter" :items="reasonFilterItems" class="w-44" size="xs" />
                <UButton label="全选可见" size="xs" color="neutral" variant="ghost" @click="selectVisible" />
                <UButton label="待核对" size="xs" color="warning" variant="ghost" @click="selectNeedsReview" />
                <UButton label="清空选择" size="xs" color="neutral" variant="ghost" @click="clearSelection" />
              </div>
            </div>

            <div class="flex items-center gap-2 flex-wrap">
              <UButton label="批量重译" size="xs" color="primary" variant="soft" :loading="retranslating" @click="retranslateSelected" />
              <UButton label="设为原文" size="xs" color="warning" variant="ghost" @click="applyBulkOriginal" />
              <UButton label="所选上移" size="xs" color="neutral" variant="ghost" @click="moveSelectedUp" />
              <UButton label="所选下移" size="xs" color="neutral" variant="ghost" @click="moveSelectedDown" />
              <UButton label="译文下移" size="xs" color="neutral" variant="ghost" title="从选中条目起译文整体下移一行" @click="shiftAllTranslations(1)" />
              <UButton label="译文上移" size="xs" color="neutral" variant="ghost" title="从选中条目起译文整体上移一行" @click="shiftAllTranslations(-1)" />
              <UButton label="保存修改" size="xs" color="neutral" :loading="saving" :disabled="dirtyCount === 0" @click="saveChanges" />
              <span class="text-xs text-gray-400">筛选仅影响当前列表，不影响最终导出范围</span>
            </div>
          </div>

          <div class="divide-y divide-gray-100 dark:divide-gray-800 max-h-[72vh] overflow-y-auto">
            <div v-for="entry in filteredEntries" :key="entry.subtitleId" :id="`review-entry-${entry.subtitleId}`" class="p-3 space-y-3" :class="focusedSubtitleId === String(entry.subtitleId) ? 'ring-2 ring-warning-400/70 rounded-2xl bg-warning-50/40 dark:bg-warning-900/10' : ''">
              <div class="flex items-start justify-between gap-3">
                <div class="min-w-0 space-y-2">
                  <div class="flex items-center gap-2 flex-wrap">
                    <UCheckbox v-model="entry.selected" />
                    <UButton icon="i-lucide-arrow-up" variant="ghost" size="xs" color="neutral" title="上移" @click="moveUp(entry)" />
                    <UButton icon="i-lucide-arrow-down" variant="ghost" size="xs" color="neutral" title="下移" @click="moveDown(entry)" />
                    <UBadge size="sm" color="neutral" variant="soft">#{{ entry.subtitleId }}</UBadge>
                    <UBadge size="sm" :color="statusColor(entry.reviewStatus)" variant="soft">{{ statusLabel(entry.reviewStatus) }}</UBadge>
                    <span class="text-[11px] text-gray-400">{{ entry.startTime }} → {{ entry.endTime }}</span>
                  </div>
                  <div v-if="entry.reviewReasons?.length" class="flex flex-wrap gap-1.5">
                    <UBadge v-for="reason in entry.reviewReasons" :key="reason" size="xs" color="warning" variant="subtle">{{ reasonLabel(reason) }}</UBadge>
                  </div>
                </div>
                <UButton label="重译" size="xs" color="primary" variant="ghost" :loading="retranslatingSingleId === entry.subtitleId" @click="retranslateSingle(entry)" />
              </div>

              <div class="grid grid-cols-1 xl:grid-cols-[minmax(180px,0.9fr)_minmax(180px,0.9fr)_minmax(240px,1.2fr)] gap-3">
                <div class="rounded-2xl bg-gray-50 dark:bg-gray-900/60 p-3 space-y-1.5">
                  <p class="text-[10px] uppercase tracking-widest text-gray-400">原文</p>
                  <p class="text-[13px] leading-6 whitespace-pre-wrap break-words text-gray-800 dark:text-gray-100">{{ entry.originalText }}</p>
                </div>
                <div class="rounded-2xl bg-gray-50 dark:bg-gray-900/60 p-3 space-y-1.5">
                  <div class="flex items-center justify-between gap-1">
                    <p class="text-[10px] uppercase tracking-widest text-gray-400">当前译文</p>
                    <div class="flex items-center gap-0.5">
                      <UButton icon="i-lucide-chevron-up" variant="ghost" size="xs" color="neutral" title="译文上移" @click="shiftTranslation(entry, -1)" />
                      <UButton icon="i-lucide-chevron-down" variant="ghost" size="xs" color="neutral" title="译文下移" @click="shiftTranslation(entry, 1)" />
                    </div>
                  </div>
                  <p class="text-[13px] leading-6 whitespace-pre-wrap break-words text-gray-800 dark:text-gray-100">{{ entry.translatedText || '—' }}</p>
                </div>
                <div class="rounded-2xl bg-white dark:bg-gray-950/60 border border-primary-100 dark:border-primary-900/40 p-3 space-y-2">
                  <div class="flex items-center justify-between gap-2 flex-wrap">
                    <p class="text-[10px] uppercase tracking-widest text-primary-500">最终导出</p>
                    <div class="flex items-center gap-0.5">
                      <UButton icon="i-lucide-chevron-up" variant="ghost" size="xs" color="primary" title="最终导出上移" @click="shiftFinal(entry, -1)" />
                      <UButton icon="i-lucide-chevron-down" variant="ghost" size="xs" color="primary" title="最终导出下移" @click="shiftFinal(entry, 1)" />
                      <UButton label="恢复译文" size="xs" color="primary" variant="ghost" @click="restoreTranslated(entry)" />
                      <UButton label="使用原文" size="xs" color="neutral" variant="ghost" @click="useOriginal(entry)" />
                    </div>
                  </div>
                  <UTextarea
                    v-model="entry.finalText"
                    :rows="4"
                    autoresize
                    :maxrows="8"
                    class="w-full"
                    @update:model-value="markEdited(entry)"
                  />
                </div>
              </div>
            </div>

            <div v-if="!filteredEntries.length" class="p-8 text-center text-sm text-gray-400">
              当前筛选下暂无字幕条目
            </div>
          </div>
        </div>
      </div>

      <div class="rounded-3xl border border-gray-100 dark:border-gray-800 bg-white/80 dark:bg-gray-950/30 overflow-hidden xl:sticky xl:top-4">
        <div class="px-4 py-3 border-b border-gray-100 dark:border-gray-800 space-y-2">
          <div class="flex items-center justify-between gap-2">
            <h2 class="text-sm font-semibold text-gray-900 dark:text-white">实时预览</h2>
            <UButton label="刷新" size="xs" color="neutral" variant="ghost" :loading="previewLoading" @click="loadPreview" />
          </div>
          <div class="flex items-center justify-between gap-2 flex-wrap">
            <USelect v-model="previewFormat" :items="previewFormatItems" class="w-28" />
            <USelect v-model="bilingualLayout" :items="bilingualLayoutItems" class="w-36" />
            <span class="text-[11px] text-gray-400">{{ previewFormat === 'ass' ? 'ASS 样式预览' : 'SRT 文本预览' }}</span>
          </div>
        </div>
        <div class="p-4">
          <div v-if="previewLoading" class="text-xs text-gray-400 flex items-center gap-2">
            <UIcon name="i-lucide-loader-2" class="w-4 h-4 animate-spin" /> 正在生成预览...
          </div>
          <pre v-else class="text-xs leading-5 whitespace-pre-wrap break-words max-h-[72vh] overflow-y-auto custom-scrollbar text-gray-800 dark:text-gray-100">{{ previewContent || '暂无预览内容' }}</pre>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
useHead({
  title: '字幕核对 - SubX'
})

const route = useRoute()
const taskId = String(route.params.id)
const focusedSubtitleId = ref('')
const toast = useToast()
const saving = ref(false)
const exporting = ref(false)
const retranslating = ref(false)
const retranslatingSingleId = ref('')
const previewLoading = ref(false)
const previewContent = ref('')
const previewFormat = ref<'srt' | 'ass'>('srt')
const bilingualLayout = ref<'translated_first' | 'original_first'>('translated_first')
const exportMode = ref<'translated' | 'bilingual' | 'original'>('translated')
const exportStyle = ref<string>('bilingual_simple')
const exportFormat = ref<'srt' | 'ass'>('srt')
const statusFilter = ref('all')
const reasonFilter = ref('all')
const summary = reactive({ total: 0, needsReview: 0, edited: 0 })
const entries = ref<any[]>([])
const taskMeta = reactive({ outputMode: 'translated', bilingualLayout: 'translated_first' as 'translated_first' | 'original_first' })
const entrySnapshots = ref<Record<string, { finalText: string, reviewStatus: string, selected: boolean, edited: boolean }>>({})

const previewFormatItems = [
  { label: 'SRT', value: 'srt' },
  { label: 'ASS', value: 'ass' }
]

const exportModeItems = [
  { label: '仅译文', value: 'translated' },
  { label: '双语', value: 'bilingual' },
  { label: '仅原文', value: 'original' }
]

const exportStyleItems = [
  { label: '简洁双语', value: 'bilingual_simple' },
  { label: '影院风格', value: 'bilingual_cinema' },
  { label: '学习模式', value: 'bilingual_study' },
  { label: '紧凑模式', value: 'bilingual_compact' },
  { label: '单色模式', value: 'bilingual_mono' }
]

const exportFormatItems = [
  { label: 'SRT', value: 'srt' },
  { label: 'ASS', value: 'ass' }
]

const bilingualLayoutItems = [
  { label: '译文在上', value: 'translated_first' },
  { label: '原文在上', value: 'original_first' }
]

const filterItems = [
  { label: '全部', value: 'all' },
  { label: '待核对', value: 'needs_review' },
  { label: '已编辑', value: 'edited' },
  { label: '仅已选', value: 'selected' }
]

const reviewStatuses = ['needs_review', 'fallback_original', 'missing']
const reasonLabels: Record<string, string> = {
  missing: '缺少译文',
  same_as_source: '译文与原文相同',
  same_as_source_allowed: '同文可接受',
  latin_heavy: '译文仍偏原语言',
  bilingual_duplicate: '双语内容重复',
  suspected_contamination: '疑似串条/混入相邻字幕',
  overlong_translation: '译文异常偏长'
}

const reasonFilterItems = computed(() => {
  const reasons = new Set<string>()
  for (const entry of entries.value) {
    for (const reason of entry.reviewReasons || []) {
      reasons.add(String(reason))
    }
  }
  return [
    { label: '全部原因', value: 'all' },
    ...Array.from(reasons).sort().map(reason => ({ label: reasonLabel(reason), value: reason }))
  ]
})

const filteredEntries = computed(() => {
  let list = entries.value

  if (statusFilter.value === 'needs_review') {
    list = list.filter(entry => reviewStatuses.includes(entry.reviewStatus))
  } else if (statusFilter.value === 'edited') {
    list = list.filter(entry => entry.edited)
  } else if (statusFilter.value === 'selected') {
    list = list.filter(entry => entry.selected)
  }

  if (reasonFilter.value !== 'all') {
    list = list.filter(entry => (entry.reviewReasons || []).includes(reasonFilter.value))
  }

  return list
})

const selectedEntries = computed(() => entries.value.filter(entry => entry.selected))
const dirtyEntries = computed(() => entries.value.filter(entry => isEntryDirty(entry)))
const dirtyCount = computed(() => dirtyEntries.value.length)

function statusLabel(status: string) {
  return ({ translated: '已翻译', accepted_same: '同文可接受', needs_review: '需核对', fallback_original: '已回退', missing: '缺失', edited: '已编辑' } as any)[status] || status
}

function statusColor(status: string) {
  return ({ translated: 'success', accepted_same: 'primary', needs_review: 'warning', fallback_original: 'error', missing: 'error', edited: 'info' } as any)[status] || 'neutral'
}

function reasonLabel(reason: string) {
  return reasonLabels[reason] || reason
}

function makeSnapshot(entry: any) {
  return {
    translatedText: String(entry.translatedText || ''),
    finalText: String(entry.finalText || ''),
    reviewStatus: String(entry.reviewStatus || ''),
    selected: !!entry.selected,
    edited: !!entry.edited
  }
}

function rebuildSnapshots(list: any[]) {
  entrySnapshots.value = Object.fromEntries(
    list.map(entry => [String(entry.subtitleId), makeSnapshot(entry)])
  )
}

function isEntryDirty(entry: any) {
  const snapshot = entrySnapshots.value[String(entry.subtitleId)]
  if (!snapshot) return true
  return snapshot.translatedText !== String(entry.translatedText || '')
    || snapshot.finalText !== String(entry.finalText || '')
    || snapshot.reviewStatus !== String(entry.reviewStatus || '')
    || snapshot.selected !== !!entry.selected
    || snapshot.edited !== !!entry.edited
}

function confirmLeaveIfDirty() {
  if (dirtyCount.value <= 0) return true
  return window.confirm('当前有未保存修改，确定要离开吗？')
}

function handleBeforeUnload(event: BeforeUnloadEvent) {
  if (dirtyCount.value <= 0) return
  event.preventDefault()
  event.returnValue = ''
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

function restoreTranslated(entry: any) {
  entry.finalText = entry.translatedText || entry.originalText
  entry.edited = true
  entry.reviewStatus = reviewStatuses.includes(entry.reviewStatus) ? entry.reviewStatus : 'edited'
}

function selectVisible() {
  for (const entry of filteredEntries.value) {
    entry.selected = true
  }
}

function selectNeedsReview() {
  for (const entry of entries.value) {
    entry.selected = reviewStatuses.includes(entry.reviewStatus)
  }
}

function clearSelection() {
  for (const entry of entries.value) {
    entry.selected = false
  }
}

function applyBulkOriginal() {
  for (const entry of selectedEntries.value) {
    useOriginal(entry)
  }
}

function moveUp(entry: any) {
  const idx = entries.value.indexOf(entry)
  if (idx <= 0) return
  const prev = entries.value[idx - 1]
  entries.value.splice(idx - 1, 2, entries.value[idx], prev)
  markEdited(entry)
  markEdited(prev)
}

function moveDown(entry: any) {
  const idx = entries.value.indexOf(entry)
  if (idx < 0 || idx >= entries.value.length - 1) return
  const next = entries.value[idx + 1]
  entries.value.splice(idx, 2, entries.value[idx + 1], entries.value[idx])
  markEdited(entry)
  markEdited(next)
}

function moveSelectedUp() {
  const selected = selectedEntries.value.map(e => entries.value.indexOf(e)).filter(idx => idx > 0)
  selected.sort((a, b) => b - a)
  for (const idx of selected) {
    const prev = entries.value[idx - 1]
    entries.value.splice(idx - 1, 2, entries.value[idx], prev)
    markEdited(entries.value[idx - 1])
    markEdited(prev)
  }
}

function moveSelectedDown() {
  const selected = selectedEntries.value.map(e => entries.value.indexOf(e)).filter(idx => idx >= 0 && idx < entries.value.length - 1)
  selected.sort((a, b) => b - a)
  for (const idx of selected) {
    const next = entries.value[idx + 1]
    entries.value.splice(idx, 2, entries.value[idx + 1], entries.value[idx])
    markEdited(entries.value[idx + 1])
    markEdited(entries.value[idx])
  }
}

function shiftTranslation(entry: any, direction: number) {
  const idx = entries.value.indexOf(entry)
  const targetIdx = idx + direction
  if (targetIdx < 0 || targetIdx >= entries.value.length) return
  const target = entries.value[targetIdx]
  const tmp = entry.translatedText
  entry.translatedText = target.translatedText || ''
  target.translatedText = tmp || ''
  markEdited(entry)
  markEdited(target)
}

function shiftFinal(entry: any, direction: number) {
  const idx = entries.value.indexOf(entry)
  const targetIdx = idx + direction
  if (targetIdx < 0 || targetIdx >= entries.value.length) return
  const target = entries.value[targetIdx]
  const tmp = entry.finalText
  entry.finalText = target.finalText || ''
  target.finalText = tmp || ''
  markEdited(entry)
  markEdited(target)
}

function shiftAllTranslations(direction: number) {
  const visibleIds = new Set(filteredEntries.value.map(e => e.subtitleId))
  for (const e of entries.value) {
    if (e.selected && !visibleIds.has(e.subtitleId)) e.selected = false
  }
  const firstIdx = entries.value.findIndex(e => e.selected)
  if (firstIdx < 0) { toast.add({ title: '请先选择起始条目', color: 'warning' }); return }

  if (direction === 1) {
    for (let i = entries.value.length - 1; i >= firstIdx; i--) {
      if (i > firstIdx) {
        entries.value[i].translatedText = entries.value[i - 1].translatedText || ''
        entries.value[i].finalText = entries.value[i - 1].finalText || ''
      } else {
        entries.value[i].translatedText = ''
        entries.value[i].finalText = ''
      }
      markEdited(entries.value[i])
    }
  } else {
    for (let i = firstIdx; i < entries.value.length; i++) {
      if (i < entries.value.length - 1) {
        entries.value[i].translatedText = entries.value[i + 1].translatedText || ''
        entries.value[i].finalText = entries.value[i + 1].finalText || ''
      } else {
        entries.value[i].translatedText = ''
        entries.value[i].finalText = ''
      }
      markEdited(entries.value[i])
    }
  }
      markEdited(entries.value[i])
    }
  } else {
    for (let i = firstIdx; i < entries.value.length; i++) {
      if (i < entries.value.length - 1) {
        entries.value[i].translatedText = entries.value[i + 1].translatedText || ''
        entries.value[i].finalText = entries.value[i + 1].finalText || ''
      } else {
        entries.value[i].translatedText = ''
        entries.value[i].finalText = ''
      }
      markEdited(entries.value[i])
    }
  }
  toast.add({ title: `译文已整体${direction === 1 ? '下' : '上'}移`, color: 'success' })
}

async function loadReview() {
  const res: any = await $fetch(`/api/tasks/${taskId}/review`)
  summary.total = res.summary.total
  summary.needsReview = res.summary.needsReview
  summary.edited = res.summary.edited
  taskMeta.outputMode = res.task?.outputMode || 'translated'
  taskMeta.bilingualLayout = res.task?.bilingualLayout || 'translated_first'
  bilingualLayout.value = taskMeta.bilingualLayout
  exportMode.value = taskMeta.outputMode as any
  exportStyle.value = res.task?.subtitleStylePreset || 'bilingual_simple'
  exportFormat.value = (res.task?.subtitleFormat === 'ass' ? 'ass' : 'srt')
  entries.value = res.entries
  rebuildSnapshots(res.entries || [])

  const focusId = String(route.query.focus || '')
  if (focusId) {
    focusedSubtitleId.value = focusId
    await nextTick()
    const target = document.getElementById(`review-entry-${focusId}`)
    target?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }
}

async function loadPreview() {
  previewLoading.value = true
  try {
    const res: any = await $fetch(`/api/tasks/${taskId}/review-preview`, { query: { format: previewFormat.value, bilingualLayout: bilingualLayout.value, outputMode: exportMode.value, subtitleStylePreset: exportStyle.value } })
    previewContent.value = res.content || ''
  } catch (error: any) {
    toast.add({ title: '预览生成失败', description: error?.data?.message || error?.message || '请稍后重试', color: 'error' })
  } finally {
    previewLoading.value = false
  }
}

async function saveChanges(showToast = true) {
  const changedEntries = dirtyEntries.value.map(entry => ({
    subtitleId: entry.subtitleId,
    translatedText: entry.translatedText,
    finalText: entry.finalText,
    reviewStatus: entry.reviewStatus,
    selected: entry.selected,
    edited: entry.edited
  }))

  if (!changedEntries.length) {
    if (showToast) toast.add({ title: '当前没有需要保存的修改', color: 'neutral' })
    return
  }

  saving.value = true
  try {
    await $fetch(`/api/tasks/${taskId}/review`, {
      method: 'PATCH',
      body: { entries: changedEntries, bilingualLayout: bilingualLayout.value }
    })
    if (showToast) toast.add({ title: `已保存 ${changedEntries.length} 条修改`, color: 'success' })
    await Promise.all([loadReview(), loadPreview()])
  } catch (error: any) {
    toast.add({ title: '保存失败', description: error?.data?.message || error?.message || '请稍后重试', color: 'error' })
    throw error
  } finally {
    saving.value = false
  }
}

async function retranslateIds(subtitleIds: string[]) {
  if (!subtitleIds.length) return
  await $fetch(`/api/tasks/${taskId}/review-retranslate`, {
    method: 'POST',
    body: { subtitleIds }
  })
  await Promise.all([loadReview(), loadPreview()])
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
  } catch (error: any) {
    toast.add({ title: '批量重译失败', description: error?.data?.message || error?.message || '请稍后重试', color: 'error' })
  } finally {
    retranslating.value = false
  }
}

async function retranslateSingle(entry: any) {
  retranslatingSingleId.value = String(entry.subtitleId)
  try {
    await saveChanges(false)
    await retranslateIds([String(entry.subtitleId)])
  } catch (error: any) {
    toast.add({ title: '单条重译失败', description: error?.data?.message || error?.message || '请稍后重试', color: 'error' })
  } finally {
    retranslatingSingleId.value = ''
  }
}

async function exportReviewed() {
  exporting.value = true
  try {
    await saveChanges(false)
    await $fetch(`/api/tasks/${taskId}/review-export`, {
      method: 'POST',
      body: { outputMode: exportMode.value, subtitleStylePreset: exportStyle.value, subtitleFormat: exportFormat.value, bilingualLayout: bilingualLayout.value }
    })
    toast.add({ title: '已导出最终字幕', color: 'success' })
    await navigateTo(`/task/${taskId}`)
  } catch (error: any) {
    toast.add({ title: '导出失败', description: error?.data?.message || error?.message || '请稍后重试', color: 'error' })
  } finally {
    exporting.value = false
  }
}

async function discardReview() {
  if (!confirmLeaveIfDirty()) return
  try {
    await $fetch(`/api/tasks/${taskId}/review-discard`, { method: 'POST' })
    toast.add({ title: '已放弃本次翻译成果', color: 'warning' })
    await navigateTo(`/history`)
  } catch (error: any) {
    toast.add({ title: '操作失败', description: error?.data?.message || error?.message || '请稍后重试', color: 'error' })
  }
}

watch(reasonFilterItems, (items) => {
  if (!items.some(item => item.value === reasonFilter.value)) {
    reasonFilter.value = 'all'
  }
})

watch(previewFormat, () => {
  loadPreview()
})

watch(bilingualLayout, async (value) => {
  taskMeta.bilingualLayout = value
  try {
    await $fetch(`/api/tasks/${taskId}/review`, {
      method: 'PATCH',
      body: { entries: [], bilingualLayout: value }
    })
  } catch (error: any) {
    toast.add({ title: '布局保存失败', description: error?.data?.message || error?.message || '请稍后重试', color: 'error' })
  }
  loadPreview()
})

watch([exportMode, exportStyle], () => {
  loadPreview()
})

onBeforeRouteLeave(() => {
  return confirmLeaveIfDirty()
})

onMounted(async () => {
  window.addEventListener('beforeunload', handleBeforeUnload)
  try {
    await loadReview()
    await loadPreview()
  } catch (error: any) {
    toast.add({ title: '核对页加载失败', description: error?.data?.message || error?.message || '请返回历史页后重试', color: 'error' })
  }
})

onBeforeUnmount(() => {
  window.removeEventListener('beforeunload', handleBeforeUnload)
})
</script>
