<template>
  <AppContainer size="wide" class="space-y-5 py-2">
    <div class="flex items-start justify-between gap-4 flex-wrap">
      <div>
        <p class="text-xs font-semibold tracking-widest text-warning-500 uppercase">字幕核对中心</p>
        <h1 class="text-2xl font-bold text-gray-900 dark:text-white mt-1">字幕核对</h1>
        <p class="text-sm text-gray-500 dark:text-gray-400 mt-2">批量筛选、重译、手动修正，并实时预览最终字幕。</p>
      </div>
      <div class="flex items-center gap-2 flex-wrap">
        <UButton label="返回任务" color="neutral" variant="ghost" :to="`/task/${taskId}`" />
        <UButton label="AI 校对" icon="i-lucide-sparkles" color="primary" variant="soft" @click="proofreadOpen = true" />
        <UButton label="预览" icon="i-lucide-eye" color="neutral" variant="soft" class="xl:hidden" @click="openPreview" />
        <UButton label="放弃成果" color="error" variant="soft" @click="discardReview" />
        <UButton label="导出结果" color="primary" :loading="exporting" @click="exportReviewed" />
        <USelect v-model="exportMode" :items="exportModeItems" class="w-28" title="导出模式" aria-label="导出模式" />
        <USelect v-model="exportStyle" :items="exportStyleItems" class="w-36" title="字幕样式" aria-label="字幕样式" />
        <USelect v-model="exportFormat" :items="exportFormatItems" class="w-20" title="导出格式" aria-label="导出格式" />
      </div>
    </div>

    <div v-if="clipUrl" class="rounded-2xl border border-primary-100 bg-primary-50/60 p-3 dark:border-primary-900/40 dark:bg-primary-950/20 space-y-2">
      <div class="flex items-center justify-between gap-2">
        <p class="text-xs font-semibold text-primary-800 dark:text-primary-200">音频片段 #{{ clipEntryId }} · {{ clipRangeText }}</p>
        <UButton icon="i-lucide-x" size="xs" color="neutral" variant="ghost" aria-label="关闭音频片段" @click="closeClip" />
      </div>
      <audio :src="clipUrl" controls autoplay class="w-full" aria-label="字幕音频片段"></audio>
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
                <span v-if="dirtyCount > 0" class="text-primary-700">待保存 {{ dirtyCount }} 条</span>
              </div>
              <div class="flex items-center gap-2 flex-wrap">
                <span class="text-xs text-gray-500 dark:text-gray-400">状态筛选</span>
                <USelect v-model="statusFilter" :items="filterItems" class="w-24" size="xs" aria-label="状态筛选" />
                <span class="text-xs text-gray-500 dark:text-gray-400">原因筛选</span>
                <USelect v-model="reasonFilter" :items="reasonFilterItems" class="w-44" size="xs" aria-label="原因筛选" />
                <USelect v-model="confidenceFilter" :items="confidenceFilterItems" class="w-32" size="xs" aria-label="ASR 置信度筛选" />
                <USelect v-model="qualityFilter" :items="qualityFilterItems" class="w-32" size="xs" aria-label="翻译质量筛选" />
                <UButton label="全选可见" size="xs" color="neutral" variant="ghost" @click="selectVisible" />
                <UButton label="待核对" size="xs" color="warning" variant="ghost" @click="selectNeedsReview" />
                <UButton label="清空选择" size="xs" color="neutral" variant="ghost" @click="clearSelection" />
              </div>
            </div>

            <div class="flex items-center gap-2 flex-wrap">
              <UButton label="批量重译" size="xs" color="primary" variant="soft" :loading="retranslating" @click="retranslateSelected" />
              <UButton label="设为原文" size="xs" color="warning" variant="ghost" @click="applyBulkOriginal" />
              <UButton label="▲上移" size="xs" color="neutral" variant="ghost" title="所选整行上移" @click="moveSelectedUp" />
              <UButton label="▼下移" size="xs" color="neutral" variant="ghost" title="所选整行下移" @click="moveSelectedDown" />
              <UButton label="保存修改" size="xs" color="neutral" :loading="saving" :disabled="dirtyCount === 0" @click="saveChanges()" />
            </div>
            <div class="flex flex-wrap items-center justify-between gap-2 border-t border-gray-100 pt-2 text-xs text-gray-500 dark:border-gray-800 dark:text-gray-400">
              <span>筛选结果 {{ filteredEntries.length }} 条 · 第 {{ currentPage }} / {{ totalPages }} 页</span>
              <div class="flex items-center gap-2">
                <USelect v-model="pageSize" :items="pageSizeItems" size="xs" class="w-24" aria-label="每页条数" />
                <UButton label="上一页" size="xs" color="neutral" variant="ghost" :disabled="currentPage <= 1" @click="currentPage -= 1" />
                <UButton label="下一页" size="xs" color="neutral" variant="ghost" :disabled="currentPage >= totalPages" @click="currentPage += 1" />
              </div>
            </div>
            <div class="flex items-center justify-between gap-2 border-t border-gray-100 pt-2 dark:border-gray-800">
              <UButton :label="showAdjustTools ? '收起调整' : '更多调整'" icon="i-lucide-sliders-horizontal" size="xs" color="neutral" variant="ghost" @click="showAdjustTools = !showAdjustTools" />
              <span class="text-[10px] text-gray-500 dark:text-gray-400">用于修正 AI 错位或批量平移文本</span>
            </div>
            <div v-show="showAdjustTools" class="flex items-center gap-2 flex-wrap border-t border-gray-100 dark:border-gray-800 pt-2">
              <UBadge color="info" variant="soft" class="text-[11px] font-semibold">译文</UBadge>
              <span class="text-[10px] text-gray-500 dark:text-gray-400">全局</span>
              <UButton icon="i-lucide-arrow-down" size="xs" color="info" variant="ghost" title="从选中条目起所有译文整体下移" aria-label="从选中条目起所有译文整体下移" @click="shiftAllCol('translatedText', 1)" />
              <UButton icon="i-lucide-arrow-up" size="xs" color="info" variant="ghost" title="从选中条目起所有译文整体上移" aria-label="从选中条目起所有译文整体上移" @click="shiftAllCol('translatedText', -1)" />
              <span class="text-[10px] text-gray-500 dark:text-gray-400">选区</span>
              <UButton icon="i-lucide-arrow-down" size="xs" color="info" variant="ghost" title="选中条目间译文轮换下移" aria-label="选中条目间译文轮换下移" @click="batchShiftCol('translatedText', 1)" />
              <UButton icon="i-lucide-arrow-up" size="xs" color="info" variant="ghost" title="选中条目间译文轮换上移" aria-label="选中条目间译文轮换上移" @click="batchShiftCol('translatedText', -1)" />
              <span class="text-gray-300 dark:text-gray-600 mx-1">│</span>
              <UBadge color="primary" variant="soft" class="text-[11px] font-semibold">最终导出</UBadge>
              <span class="text-[10px] text-gray-500 dark:text-gray-400">全局</span>
              <UButton icon="i-lucide-arrow-down" size="xs" color="primary" variant="ghost" title="从选中条目起所有导出文本整体下移" aria-label="从选中条目起所有导出文本整体下移" @click="shiftAllCol('finalText', 1)" />
              <UButton icon="i-lucide-arrow-up" size="xs" color="primary" variant="ghost" title="从选中条目起所有导出文本整体上移" aria-label="从选中条目起所有导出文本整体上移" @click="shiftAllCol('finalText', -1)" />
              <span class="text-[10px] text-gray-500 dark:text-gray-400">选区</span>
              <UButton icon="i-lucide-arrow-down" size="xs" color="primary" variant="ghost" title="选中条目间导出文本轮换下移" aria-label="选中条目间导出文本轮换下移" @click="batchShiftCol('finalText', 1)" />
              <UButton icon="i-lucide-arrow-up" size="xs" color="primary" variant="ghost" title="选中条目间导出文本轮换上移" aria-label="选中条目间导出文本轮换上移" @click="batchShiftCol('finalText', -1)" />
              <UButton label="恢复译文" size="xs" color="primary" variant="ghost" title="将选中条目的导出文本恢复为译文" @click="batchRestoreTranslated" />
            </div>
          </div>

          <div class="divide-y divide-gray-100 dark:divide-gray-800 max-h-[72vh] overflow-y-auto">
            <div
              v-for="entry in pagedEntries"
              :key="entry.subtitleId"
              v-memo="[entry.finalText, entry.translatedText, entry.reviewStatus, entry.selected, entry.edited, entry.qualityScore, entry.qualityIssues?.join(','), focusedSubtitleId === String(entry.subtitleId)]"
              :id="`review-entry-${entry.subtitleId}`"
              tabindex="-1"
              class="p-3 space-y-3"
              :class="focusedSubtitleId === String(entry.subtitleId) ? 'ring-2 ring-warning-400/70 rounded-2xl bg-warning-50/40 dark:bg-warning-900/10' : ''"
            >
              <div class="flex items-start justify-between gap-3">
                <div class="min-w-0 space-y-2">
                  <div class="flex items-center gap-2 flex-wrap">
                    <span class="inline-flex" @click.prevent="onCheckboxClick(entry, $event)">
                      <UCheckbox :model-value="entry.selected" :aria-label="`选择字幕 #${entry.subtitleId}`" />
                    </span>
                    <UButton icon="i-lucide-arrow-up" variant="ghost" size="xs" color="neutral" title="上移" aria-label="上移" @click="moveUp(entry)" />
                    <UButton icon="i-lucide-arrow-down" variant="ghost" size="xs" color="neutral" title="下移" aria-label="下移" @click="moveDown(entry)" />
                    <UBadge size="sm" color="neutral" variant="soft">#{{ entry.subtitleId }}</UBadge>
                    <UBadge size="sm" :color="statusColor(entry.reviewStatus)" variant="soft">{{ statusLabel(entry.reviewStatus) }}</UBadge>
                    <UBadge v-if="entry.asrConfidence != null" size="sm" :color="Number(entry.asrConfidence) < 0.6 ? 'warning' : 'success'" variant="subtle">
                      ASR {{ (Number(entry.asrConfidence) * 100).toFixed(0) }}%
                    </UBadge>
                    <UBadge v-if="entry.qualityScore != null" size="sm" :color="Number(entry.qualityScore) < qualityThreshold ? 'warning' : 'success'" variant="subtle">
                      质量 {{ (Number(entry.qualityScore) * 100).toFixed(0) }}%
                    </UBadge>
                    <span class="text-[11px] text-gray-500 dark:text-gray-400">{{ entry.startTime }} → {{ entry.endTime }}</span>
                  </div>
                  <div class="flex flex-wrap gap-1.5">
                    <UBadge v-for="reason in entry.reviewReasons" :key="reason" size="xs" color="warning" variant="subtle">{{ reasonLabel(reason) }}</UBadge>
                    <UBadge v-for="issue in entry.qualityIssues" :key="`quality-${issue}`" size="xs" color="error" variant="subtle">{{ qualityIssueLabel(issue) }}</UBadge>
                  </div>
                </div>
                <div class="flex items-center gap-1">
                  <UButton icon="i-lucide-play" size="xs" color="neutral" variant="ghost" :aria-label="`播放片段 #${entry.subtitleId}`" title="播放音频片段" @click="playClip(entry)" />
                  <UButton label="重译" size="xs" color="primary" variant="ghost" :loading="retranslatingSingleId === entry.subtitleId" @click="retranslateSingle(entry)" />
                </div>
              </div>

              <div class="grid grid-cols-1 xl:grid-cols-[minmax(180px,0.9fr)_minmax(180px,0.9fr)_minmax(240px,1.2fr)] gap-3">
                <div class="rounded-2xl bg-gray-50 dark:bg-gray-900/60 p-3 space-y-1.5">
                  <p class="text-[10px] uppercase tracking-widest text-gray-500 dark:text-gray-400">原文</p>
                  <p class="text-[13px] leading-6 whitespace-pre-wrap break-words text-gray-800 dark:text-gray-100">{{ entry.originalText }}</p>
                </div>
                <div class="rounded-2xl bg-gray-50 dark:bg-gray-900/60 p-3 space-y-1.5">
                  <div class="flex items-center justify-between gap-1">
                    <p class="text-[10px] uppercase tracking-widest text-gray-500 dark:text-gray-400">当前译文</p>
                    <div class="flex items-center gap-0.5">
                      <UButton icon="i-lucide-chevron-up" variant="ghost" size="xs" color="neutral" title="译文上移" aria-label="译文上移" @click="shiftTranslation(entry, -1)" />
                      <UButton icon="i-lucide-chevron-down" variant="ghost" size="xs" color="neutral" title="译文下移" aria-label="译文下移" @click="shiftTranslation(entry, 1)" />
                    </div>
                  </div>
                  <p class="text-[13px] leading-6 whitespace-pre-wrap break-words text-gray-800 dark:text-gray-100">{{ entry.translatedText || '—' }}</p>
                </div>
                <div class="rounded-2xl bg-white dark:bg-gray-950/60 border border-primary-100 dark:border-primary-900/40 p-3 space-y-2">
                  <div class="flex items-center justify-between gap-2 flex-wrap">
                    <p class="text-[10px] uppercase tracking-widest text-primary-700">最终导出</p>
                    <div class="flex items-center gap-0.5">
                      <UButton icon="i-lucide-chevron-up" variant="ghost" size="xs" color="primary" title="最终导出上移" aria-label="最终导出上移" @click="shiftFinal(entry, -1)" />
                      <UButton icon="i-lucide-chevron-down" variant="ghost" size="xs" color="primary" title="最终导出下移" aria-label="最终导出下移" @click="shiftFinal(entry, 1)" />
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
                    :aria-label="`最终导出 #${entry.subtitleId}`"
                    @update:model-value="markEdited(entry)"
                  />
                </div>
              </div>
            </div>

            <div v-if="!filteredEntries.length" class="p-8 text-center text-sm text-gray-500 dark:text-gray-400">
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
            <USelect v-model="previewFormat" :items="previewFormatItems" class="w-28" aria-label="预览格式" />
            <USelect v-model="bilingualLayout" :items="bilingualLayoutItems" class="w-36" aria-label="双语布局" />
            <span class="text-[11px] text-gray-500 dark:text-gray-400">{{ previewFormat === 'ass' ? 'ASS 样式预览' : 'SRT 文本预览' }}</span>
          </div>
        </div>
        <div class="p-4">
          <div v-if="previewLoading" class="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-2">
            <UIcon name="i-lucide-loader-2" class="w-4 h-4 animate-spin" /> 正在生成预览...
          </div>
          <pre v-else tabindex="0" aria-label="字幕预览内容" class="text-xs leading-5 whitespace-pre-wrap break-words max-h-[72vh] overflow-y-auto custom-scrollbar text-gray-800 dark:text-gray-100">{{ previewContent || '暂无预览内容' }}</pre>
        </div>
      </div>
    </div>

    <UModal v-model:open="proofreadOpen" title="AI 校对与术语学习" description="用当前翻译模型提取术语或检查译名一致性。">
      <template #body>
        <div class="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
          <div class="flex flex-wrap gap-2">
            <UButton label="术语建议" icon="i-lucide-book-marked" size="sm" color="primary" :variant="proofreadKind === 'glossary' ? 'solid' : 'soft'" :loading="proofreadLoading && proofreadKind === 'glossary'" @click="runProofread('glossary')" />
            <UButton label="一致性检查" icon="i-lucide-scan-search" size="sm" color="warning" :variant="proofreadKind === 'consistency' ? 'solid' : 'soft'" :loading="proofreadLoading && proofreadKind === 'consistency'" @click="runProofread('consistency')" />
          </div>
          <div v-if="proofreadLoading" class="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
            <UIcon name="i-lucide-loader-2" class="h-4 w-4 animate-spin" /> 正在分析字幕...
          </div>
          <template v-else-if="proofreadResult">
            <div v-if="proofreadResult.terms?.length" class="space-y-2">
              <div class="flex flex-wrap items-center justify-between gap-2">
                <p class="text-sm font-semibold text-gray-800 dark:text-gray-100">术语建议 {{ proofreadResult.terms.length }} 条</p>
                <UButton label="全部加入术语表" icon="i-lucide-plus" size="xs" color="primary" :loading="applyingTerms" @click="applyProofreadTerms" />
              </div>
              <div class="space-y-2">
                <div v-for="term in proofreadResult.terms" :key="`${term.source}-${term.target}`" class="rounded-xl border border-gray-100 bg-gray-50/70 p-3 dark:border-gray-800 dark:bg-gray-900/30">
                  <p class="text-sm text-gray-800 dark:text-gray-100"><span class="font-mono">{{ term.source }}</span> → <span class="font-semibold text-primary-700 dark:text-primary-300">{{ term.target }}</span></p>
                  <p v-if="term.reason" class="mt-1 text-xs text-gray-500 dark:text-gray-400">{{ term.reason }}</p>
                </div>
              </div>
            </div>
            <div v-if="proofreadResult.issues?.length" class="space-y-2">
              <p class="text-sm font-semibold text-amber-800 dark:text-amber-200">一致性问题 {{ proofreadResult.issues.length }} 条</p>
              <div v-for="issue in proofreadResult.issues" :key="`${issue.subtitleId}-${issue.type}-${issue.message}`" class="rounded-xl border border-amber-100 bg-amber-50/70 p-3 dark:border-amber-900/40 dark:bg-amber-950/20">
                <p class="text-xs font-semibold text-amber-900 dark:text-amber-100">#{{ issue.subtitleId }} · {{ issue.type }}</p>
                <p class="mt-1 text-xs text-amber-800 dark:text-amber-200">{{ issue.message }}</p>
              </div>
            </div>
            <div v-if="!proofreadResult.terms?.length && !proofreadResult.issues?.length" class="text-sm text-gray-500 dark:text-gray-400">未发现可建议内容。</div>
          </template>
          <div v-else class="text-sm text-gray-500 dark:text-gray-400">选择上方按钮开始 AI 校对。</div>
        </div>
      </template>
      <template #footer>
        <div class="flex w-full justify-end">
          <UButton label="关闭" color="neutral" variant="ghost" @click="proofreadOpen = false" />
        </div>
      </template>
    </UModal>

    <USlideover v-model:open="previewOpen" title="字幕预览" description="查看当前导出设置的 SRT/ASS 预览。" :ui="{ content: 'w-full sm:max-w-2xl' }">
      <template #body>
        <div class="space-y-4">
          <div class="flex flex-wrap items-center gap-2">
            <USelect v-model="previewFormat" :items="previewFormatItems" class="w-28" aria-label="预览格式" />
            <USelect v-model="bilingualLayout" :items="bilingualLayoutItems" class="w-36" aria-label="双语布局" />
            <UButton label="刷新预览" size="xs" color="neutral" variant="soft" :loading="previewLoading" @click="loadPreview" />
          </div>
          <pre tabindex="0" aria-label="字幕预览内容" class="max-h-[65vh] overflow-y-auto whitespace-pre-wrap break-words rounded-xl bg-gray-950 p-4 text-xs leading-5 text-gray-100">{{ previewContent || '暂无预览内容' }}</pre>
        </div>
      </template>
    </USlideover>
  </AppContainer>
</template>

<script setup lang="ts">
useHead({
  title: '字幕核对 - SubX'
})

const route = useRoute()
const taskId = String(route.params.id)
const focusedSubtitleId = ref('')
const toast = useToast()
const { data: appConfig } = await useFetch('/api/config')
const qualityThreshold = computed(() => Number(appConfig.value?.qualityScoreThreshold ?? 0.7))
const saving = ref(false)
const exporting = ref(false)
const retranslating = ref(false)
const retranslatingSingleId = ref('')
const clipUrl = ref('')
const clipEntryId = ref('')
const clipRangeText = ref('')
const proofreadOpen = ref(false)
const proofreadLoading = ref(false)
const proofreadKind = ref<'glossary' | 'consistency'>('glossary')
const proofreadResult = ref<any>(null)
const applyingTerms = ref(false)
const previewLoading = ref(false)
const previewContent = ref('')
const previewOpen = ref(false)
const showAdjustTools = ref(false)
const previewFormat = ref<'srt' | 'ass'>('srt')
const bilingualLayout = ref<'translated_first' | 'original_first'>('translated_first')
const exportMode = ref<'translated' | 'bilingual' | 'original'>('translated')
const exportStyle = ref<string>('bilingual_simple')
const exportFormat = ref<'srt' | 'ass'>('srt')
const statusFilter = ref('all')
const reasonFilter = ref('all')
const confidenceFilter = ref('all')
const qualityFilter = ref('all')
const pageSize = ref(100)
const currentPage = ref(1)
const pageSizeItems = [
  { label: '50 条/页', value: 50 },
  { label: '100 条/页', value: 100 },
  { label: '200 条/页', value: 200 }
]
const summary = reactive({ total: 0, needsReview: 0, edited: 0 })
const entries = ref<any[]>([])
const taskMeta = reactive({ outputMode: 'translated', bilingualLayout: 'translated_first' as 'translated_first' | 'original_first' })
const lastClickedIndex = ref(-1)
const entrySnapshots = ref<Record<string, { translatedText: string, finalText: string, reviewStatus: string, selected: boolean, edited: boolean }>>({})

function srtTimeToSeconds(value: string) {
  const match = String(value || '').match(/(\d+):(\d+):(\d+)[,.](\d+)/)
  if (!match) return 0
  return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]) + Number(match[4]) / 1000
}

function playClip(entry: any) {
  const start = srtTimeToSeconds(entry.startTime)
  const end = Math.max(start + 1, srtTimeToSeconds(entry.endTime))
  clipEntryId.value = String(entry.subtitleId)
  clipRangeText.value = `${entry.startTime} → ${entry.endTime}`
  clipUrl.value = `/api/tasks/${taskId}/audio?start=${encodeURIComponent(start.toFixed(3))}&end=${encodeURIComponent(end.toFixed(3))}&t=${Date.now()}`
}

async function runProofread(kind: 'glossary' | 'consistency') {
  proofreadKind.value = kind
  proofreadLoading.value = true
  proofreadResult.value = null
  try {
    proofreadResult.value = await $fetch(`/api/tasks/${taskId}/proofread`, { method: 'POST', body: { kind } })
  } catch (e: any) {
    toast.add({ title: 'AI 校对失败', description: e?.data?.message || e?.message || '无法完成校对', color: 'error' })
  } finally {
    proofreadLoading.value = false
  }
}

async function applyProofreadTerms() {
  if (!proofreadResult.value?.terms?.length) return
  applyingTerms.value = true
  try {
    const config: any = await $fetch('/api/config')
    const glossary = { ...(config.glossary || {}) }
    for (const term of proofreadResult.value.terms) {
      if (term.source && term.target) glossary[term.source] = term.target
    }
    await $fetch('/api/config', { method: 'PUT', body: { glossary } })
    toast.add({ title: '已加入术语表', description: `${proofreadResult.value.terms.length} 个术语已保存`, color: 'success' })
  } catch (e: any) {
    toast.add({ title: '保存失败', description: e?.data?.message || e?.message || '无法更新术语表', color: 'error' })
  } finally {
    applyingTerms.value = false
  }
}

function closeClip() {
  clipUrl.value = ''
  clipEntryId.value = ''
  clipRangeText.value = ''
}

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
const confidenceFilterItems = [
  { label: '全部置信度', value: 'all' },
  { label: '低置信度 <60%', value: 'low' },
  { label: '无置信度', value: 'missing' }
]
const qualityFilterItems = [
  { label: '全部质量', value: 'all' },
  { label: '低质量 <70%', value: 'low' },
  { label: '高质量 ≥70%', value: 'high' },
  { label: '未校验', value: 'missing' }
]

const reviewStatuses = ['needs_review', 'fallback_original', 'missing']
const reasonLabels: Record<string, string> = {
  missing: '缺少译文',
  same_as_source: '译文与原文相同',
  same_as_source_allowed: '同文可接受',
  latin_heavy: '译文仍偏原语言',
  bilingual_duplicate: '双语内容重复',
  suspected_contamination: '疑似串条/混入相邻字幕',
  overlong_translation: '译文异常偏长',
  low_asr_confidence: 'ASR 置信度偏低',
  low_quality_translation: '双模型质量评分偏低'
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

  if (confidenceFilter.value === 'low') {
    list = list.filter(entry => entry.asrConfidence != null && Number(entry.asrConfidence) < 0.6)
  } else if (confidenceFilter.value === 'missing') {
    list = list.filter(entry => entry.asrConfidence == null)
  }

  if (qualityFilter.value === 'low') {
    list = list.filter(entry => entry.qualityScore != null && Number(entry.qualityScore) < qualityThreshold.value)
  } else if (qualityFilter.value === 'high') {
    list = list.filter(entry => entry.qualityScore != null && Number(entry.qualityScore) >= qualityThreshold.value)
  } else if (qualityFilter.value === 'missing') {
    list = list.filter(entry => entry.qualityScore == null)
  }

  return list
})

const totalPages = computed(() => Math.max(1, Math.ceil(filteredEntries.value.length / pageSize.value)))
const pagedEntries = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value
  return filteredEntries.value.slice(start, start + pageSize.value)
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

const qualityIssueLabels: Record<string, string> = {
  omission: '漏译',
  addition: '增译',
  mistranslation: '误译',
  fluency: '不自然',
  terminology: '术语不一致',
  formatting: '格式/标点',
  name_inconsistency: '人名不一致',
  style_mismatch: '风格不匹配',
  other: '其他问题'
}

function qualityIssueLabel(issue: string) {
  return qualityIssueLabels[issue] || issue
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
  lastClickedIndex.value = -1
}

function onCheckboxClick(entry: any, event: MouseEvent) {
  const idx = entries.value.indexOf(entry)
  if (idx < 0) return

  const anchor = lastClickedIndex.value
  if (event.shiftKey && anchor >= 0) {
    const start = Math.min(anchor, idx)
    const end = Math.max(anchor, idx)
    for (let i = start; i <= end; i++) {
      entries.value[i].selected = true
    }
    return
  }

  entry.selected = !entry.selected
  lastClickedIndex.value = idx
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
  lastClickedIndex.value = -1
}

function moveDown(entry: any) {
  const idx = entries.value.indexOf(entry)
  if (idx < 0 || idx >= entries.value.length - 1) return
  const next = entries.value[idx + 1]
  entries.value.splice(idx, 2, entries.value[idx + 1], entries.value[idx])
  markEdited(entry)
  markEdited(next)
  lastClickedIndex.value = -1
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
  lastClickedIndex.value = -1
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
  lastClickedIndex.value = -1
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

function shiftAllCol(field: 'translatedText' | 'finalText', direction: number) {
  const visibleIds = new Set(filteredEntries.value.map(e => e.subtitleId))
  for (const e of entries.value) {
    if (e.selected && !visibleIds.has(e.subtitleId)) e.selected = false
  }
  const firstIdx = entries.value.findIndex(e => e.selected)
  if (firstIdx < 0) { toast.add({ title: '请先选择起始条目', color: 'warning' }); return }

  const label = field === 'translatedText' ? '译文' : '导出'

  if (direction === 1) {
    for (let i = entries.value.length - 1; i >= firstIdx; i--) {
      if (i > firstIdx) {
        entries.value[i][field] = entries.value[i - 1][field] || ''
      } else {
        entries.value[i][field] = ''
      }
      markEdited(entries.value[i])
    }
  } else {
    const startIdx = firstIdx > 0 ? firstIdx - 1 : firstIdx
    if (startIdx < firstIdx) markEdited(entries.value[startIdx])
    for (let i = startIdx; i < entries.value.length; i++) {
      if (i < entries.value.length - 1) {
        entries.value[i][field] = entries.value[i + 1][field] || ''
      } else {
        entries.value[i][field] = ''
      }
      markEdited(entries.value[i])
    }
  }
  toast.add({ title: `${label}已整体${direction === 1 ? '下' : '上'}移`, color: 'success' })
}

function batchShiftCol(field: 'translatedText' | 'finalText', direction: -1 | 1) {
  const sel = selectedEntries.value
  if (sel.length < 2) { toast.add({ title: '请选择至少 2 条', color: 'warning' }); return }
  if (direction === -1) {
    for (let i = 0; i < sel.length - 1; i++) {
      sel[i][field] = sel[i + 1][field] || ''
      markEdited(sel[i])
    }
    sel[sel.length - 1][field] = ''
    markEdited(sel[sel.length - 1])
  } else {
    for (let i = sel.length - 1; i > 0; i--) {
      sel[i][field] = sel[i - 1][field] || ''
      markEdited(sel[i])
    }
    sel[0][field] = ''
    markEdited(sel[0])
  }
  toast.add({ title: `已平移 ${sel.length} 条`, color: 'success' })
}

function batchRestoreTranslated() {
  const sel = selectedEntries.value
  if (!sel.length) { toast.add({ title: '请先选择条目', color: 'warning' }); return }
  for (const entry of sel) {
    restoreTranslated(entry)
  }
  toast.add({ title: `已恢复 ${sel.length} 条译文`, color: 'success' })
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
  lastClickedIndex.value = -1
  rebuildSnapshots(res.entries || [])

  const focusId = String(route.query.focus || '')
  if (focusId) {
    const focusIndex = entries.value.findIndex(entry => String(entry.subtitleId) === focusId)
    if (focusIndex >= 0) currentPage.value = Math.floor(focusIndex / pageSize.value) + 1
    focusedSubtitleId.value = focusId
    await nextTick()
    const target = document.getElementById(`review-entry-${focusId}`)
    target?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }
}

function openPreview() {
  previewOpen.value = true
  loadPreview()
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
  const changedEntries = entries.value.map((entry, index) => ({
    subtitleId: entry.subtitleId,
    translatedText: entry.translatedText,
    finalText: entry.finalText,
    reviewStatus: entry.reviewStatus,
    sortOrder: index,
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

watch([statusFilter, reasonFilter, confidenceFilter, qualityFilter], () => {
  currentPage.value = 1
})

watch([pageSize, totalPages], () => {
  if (currentPage.value > totalPages.value) currentPage.value = totalPages.value
  if (currentPage.value < 1) currentPage.value = 1
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

function isEditableTarget(target: EventTarget | null) {
  return target instanceof HTMLElement && Boolean(target.closest('input, textarea, select, [contenteditable="true"]'))
}

function focusEntryByOffset(offset: number) {
  const list = filteredEntries.value
  if (!list.length) return
  const currentIndex = focusedSubtitleId.value
    ? list.findIndex(entry => String(entry.subtitleId) === focusedSubtitleId.value)
    : -1
  let nextIndex = currentIndex < 0 ? (offset > 0 ? 0 : list.length - 1) : currentIndex + offset
  nextIndex = Math.max(0, Math.min(list.length - 1, nextIndex))
  const entry = list[nextIndex]
  if (!entry) return
  focusedSubtitleId.value = String(entry.subtitleId)
  const nextPage = Math.floor(nextIndex / pageSize.value) + 1
  if (nextPage !== currentPage.value) currentPage.value = nextPage
  nextTick(() => {
    const element = document.getElementById(`review-entry-${entry.subtitleId}`) as HTMLElement | null
    element?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    element?.focus()
  })
}

function handleShortcut(event: KeyboardEvent) {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
    event.preventDefault()
    saveChanges()
    return
  }
  if (isEditableTarget(event.target)) return
  if (event.key === 'j' || event.key === 'J') {
    event.preventDefault()
    focusEntryByOffset(1)
  } else if (event.key === 'k' || event.key === 'K') {
    event.preventDefault()
    focusEntryByOffset(-1)
  } else if (event.key === 'Enter' && focusedSubtitleId.value) {
    event.preventDefault()
    const element = document.getElementById(`review-entry-${focusedSubtitleId.value}`)
    element?.querySelector('textarea')?.focus()
  }
}

onMounted(async () => {
  window.addEventListener('beforeunload', handleBeforeUnload)
  window.addEventListener('keydown', handleShortcut)
  try {
    await loadReview()
    await loadPreview()
  } catch (error: any) {
    toast.add({ title: '核对页加载失败', description: error?.data?.message || error?.message || '请返回历史页后重试', color: 'error' })
  }
})

onBeforeUnmount(() => {
  window.removeEventListener('beforeunload', handleBeforeUnload)
  window.removeEventListener('keydown', handleShortcut)
})
</script>
