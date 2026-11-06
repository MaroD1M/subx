<template>
  <AppContainer size="wide" class="space-y-5 py-2">
    <PageHeader
      title="字幕核对"
      description="批量筛选、重译、手动修正，并实时预览最终字幕。"
      :breadcrumb="[{ label: '翻译历史', icon: 'i-lucide-history', to: '/history' }, { label: '字幕核对' }]"
    >
      <template #actions>
        <UButton label="操作指南" icon="i-lucide-help-circle" color="neutral" variant="ghost" @click="guideOpen = true" />
        <UButton label="返回任务" color="neutral" variant="ghost" :to="`/task/${taskId}`" />
        <UButton label="AI 校对" icon="i-lucide-sparkles" color="primary" variant="soft" title="只生成术语与一致性建议，不会自动修改字幕" @click="proofreadOpen = true" />
        <UButton label="预览" icon="i-lucide-eye" color="neutral" variant="soft" class="xl:hidden" @click="openPreview" />
        <UButton label="放弃成果" color="error" variant="soft" title="将任务标记为失败并作废本次翻译结果" @click="discardReview" />
        <UButton label="导出结果" color="primary" :loading="exporting" title="先保存当前修改，再生成字幕文件并返回任务页" @click="exportReviewed" />
      </template>
    </PageHeader>

    <div v-if="taskMeta.outputMode === 'original' && summary.total > 0" class="rounded-2xl border border-amber-200 bg-amber-50/80 p-3 text-xs leading-relaxed text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-200">
      该任务为「仅原文字幕」：核对页用于查看、编辑和导出原始字幕。批量重译 / AI 校对会调用翻译模型，是否使用由你决定。
    </div>

    <div class="surface-card space-y-2 p-3">
      <div class="flex flex-wrap items-end gap-3">
        <UFormField label="导出模式" class="min-w-[120px]">
          <USelect v-model="exportMode" :items="exportModeItems" class="w-32" title="决定导出文件使用译文、双语还是原文" />
        </UFormField>
        <UFormField label="字幕样式" class="min-w-[140px]">
          <USelect v-model="exportStyle" :items="exportStyleItems" class="w-40" title="仅影响 ASS 字幕的双语排版和样式" />
        </UFormField>
        <UFormField label="导出格式" class="min-w-[100px]">
          <USelect v-model="exportFormat" :items="exportFormatItems" class="w-24" title="SRT 兼容性最好；ASS 支持样式和双语排版" />
        </UFormField>
        <UButton label="操作指南" icon="i-lucide-help-circle" size="xs" color="neutral" variant="ghost" @click="guideOpen = true" />
      </div>
      <p class="text-[11px] leading-relaxed text-gray-500 dark:text-gray-400">
        导出前会自动保存当前修改。文件内容以每条字幕的「最终导出」列为准；「当前译文」只作为恢复和重译参考。
      </p>
    </div>

    <div v-if="clipUrl" class="rounded-2xl border border-primary-100 bg-primary-50/60 p-3 dark:border-primary-900/40 dark:bg-primary-950/20 space-y-2">
      <div class="flex items-center justify-between gap-2">
        <p class="text-xs font-semibold text-primary-800 dark:text-primary-200">音频片段 #{{ clipEntryId }} · {{ clipRangeText }}</p>
        <UButton icon="i-lucide-x" size="xs" color="neutral" variant="ghost" aria-label="关闭音频片段" @click="closeClip" />
      </div>
      <audio :src="clipUrl" controls autoplay class="w-full" aria-label="字幕音频片段"></audio>
    </div>

    <div class="grid grid-cols-2 lg:grid-cols-5 gap-3">
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
      <button
        type="button"
        class="surface-card p-4 text-left ring-1 ring-red-200/50 transition hover:ring-red-300 dark:ring-red-800/30 dark:hover:ring-red-700"
        title="点击筛选：译文为空或与原文完全相同"
        @click="applyFilterPreset('untranslated')"
      >
        <p class="stat-label text-red-500">未翻译 / 同文</p>
        <p class="stat-value text-red-700 dark:text-red-300">{{ contentCounts.untranslated }}</p>
      </button>
      <div class="surface-card p-4">
        <p class="stat-label">当前可见</p>
        <p class="stat-value">{{ filteredEntries.length }}</p>
      </div>
    </div>

    <div class="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_380px] gap-5 items-start">
      <div class="space-y-4 min-w-0">
        <div class="surface-card overflow-hidden">
          <div class="px-4 py-3 border-b border-gray-100 dark:border-gray-800 space-y-3">
            <div class="flex items-center justify-between gap-3 flex-wrap">
              <div class="flex items-center gap-3 flex-wrap text-sm text-gray-500 dark:text-gray-400">
                <span>已选 {{ selectedEntries.length }} 条</span>
                <span v-if="dirtyCount > 0" class="text-primary-700">待保存 {{ dirtyCount }} 条</span>
                <span v-if="hasActiveFilters" class="text-primary-600 dark:text-primary-400">已启用 {{ activeFilterCount }} 个筛选</span>
              </div>
              <div class="flex items-center gap-2 flex-wrap">
                <UButton label="操作指南" icon="i-lucide-help-circle" size="xs" color="neutral" variant="ghost" @click="guideOpen = true" />
                <UButton label="重置筛选" icon="i-lucide-filter-x" size="xs" color="neutral" variant="ghost" :disabled="!hasActiveFilters" @click="resetFilters" />
              </div>
            </div>

            <div class="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
              <label class="flex flex-col gap-1">
                <span class="text-[11px] font-medium text-gray-500 dark:text-gray-400">搜索原文 / 译文 / 编号</span>
                <UInput v-model="searchQuery" icon="i-lucide-search" size="xs" placeholder="例如：人名、台词、编号" class="w-full" aria-label="搜索字幕内容" />
              </label>
              <label class="flex flex-col gap-1">
                <UTooltip text="按核对状态筛选。待核对包含需核对、已回退和缺失；待保存只看尚未写入数据库的修改。">
                  <span class="inline-flex cursor-help items-center gap-1 text-[11px] font-medium text-gray-500 dark:text-gray-400">状态筛选 <UIcon name="i-lucide-circle-help" class="h-3 w-3" /></span>
                </UTooltip>
                <USelect v-model="statusFilter" :items="statusFilterItems" class="w-full" size="xs" aria-label="状态筛选" />
              </label>
              <label class="flex flex-col gap-1">
                <UTooltip text="按内容特征筛选。译文与原文相同会忽略标点、空格和格式标签；需要处理会合并空译文、同文、低质量、低置信度和待核对条目。">
                  <span class="inline-flex cursor-help items-center gap-1 text-[11px] font-medium text-gray-500 dark:text-gray-400">内容筛选 <UIcon name="i-lucide-circle-help" class="h-3 w-3" /></span>
                </UTooltip>
                <USelect v-model="contentFilter" :items="contentFilterItems" class="w-full" size="xs" aria-label="内容筛选" />
              </label>
              <label class="flex flex-col gap-1">
                <UTooltip text="按系统记录的核对原因筛选，例如缺少译文、译文与原文相同、疑似串条等。">
                  <span class="inline-flex cursor-help items-center gap-1 text-[11px] font-medium text-gray-500 dark:text-gray-400">原因筛选 <UIcon name="i-lucide-circle-help" class="h-3 w-3" /></span>
                </UTooltip>
                <USelect v-model="reasonFilter" :items="reasonFilterItems" class="w-full" size="xs" aria-label="原因筛选" />
              </label>
              <label class="flex flex-col gap-1">
                <UTooltip text="按语音识别置信度筛选。低于 60% 通常意味着原文字幕本身可能不准确，建议结合音频片段确认。">
                  <span class="inline-flex cursor-help items-center gap-1 text-[11px] font-medium text-gray-500 dark:text-gray-400">ASR 置信度 <UIcon name="i-lucide-circle-help" class="h-3 w-3" /></span>
                </UTooltip>
                <USelect v-model="confidenceFilter" :items="confidenceFilterItems" class="w-full" size="xs" aria-label="ASR 置信度筛选" />
              </label>
              <label class="flex flex-col gap-1">
                <UTooltip text="按双模型质量校验分数筛选。阈值默认 70%，可在设置页调整。">
                  <span class="inline-flex cursor-help items-center gap-1 text-[11px] font-medium text-gray-500 dark:text-gray-400">翻译质量 <UIcon name="i-lucide-circle-help" class="h-3 w-3" /></span>
                </UTooltip>
                <USelect v-model="qualityFilter" :items="qualityFilterItems" class="w-full" size="xs" aria-label="翻译质量筛选" />
              </label>
            </div>

            <div class="flex items-center gap-2 flex-wrap border-t border-gray-100 pt-2 dark:border-gray-800">
              <span class="text-[11px] font-medium text-gray-500 dark:text-gray-400">快捷筛选</span>
              <UButton label="需要处理" size="xs" color="warning" variant="soft" title="空译文、同文、待核对、低质量、低置信度或有核对原因的条目" @click="applyFilterPreset('needs_attention')" />
              <UButton label="未翻译 / 同文" size="xs" color="error" variant="soft" title="译文为空，或译文与原文完全相同" @click="applyFilterPreset('untranslated')" />
              <UButton label="低质量" size="xs" color="warning" variant="ghost" title="质量分低于设置阈值" @click="applyFilterPreset('low_quality')" />
              <UButton label="低置信度" size="xs" color="neutral" variant="ghost" title="ASR 置信度低于 60%" @click="applyFilterPreset('low_confidence')" />
              <UButton label="待保存" size="xs" color="neutral" variant="ghost" title="只看尚未保存的修改" @click="applyFilterPreset('dirty')" />
            </div>

            <div class="flex items-center gap-2 flex-wrap border-t border-gray-100 pt-2 dark:border-gray-800">
              <span class="text-[11px] font-medium text-gray-500 dark:text-gray-400">选择</span>
              <UButton label="全选筛选结果" size="xs" color="neutral" variant="ghost" title="选中当前筛选出的所有条目（跨页生效）" @click="selectVisible" />
              <UButton label="选待核对" size="xs" color="warning" variant="ghost" title="选中所有需要核对的条目" @click="selectNeedsReview" />
              <UButton label="反选可见" size="xs" color="neutral" variant="ghost" title="反转当前筛选结果的选中状态" @click="invertVisibleSelection" />
              <UButton label="清空选择" size="xs" color="neutral" variant="ghost" @click="clearSelection" />
            </div>

            <div class="flex items-center gap-2 flex-wrap border-t border-gray-100 pt-2 dark:border-gray-800">
              <UButton label="重译选中" size="xs" color="primary" variant="soft" :loading="retranslating" title="对已勾选条目调用模型重译；会覆盖当前译文和最终导出" @click="retranslateSelected" />
              <UButton label="重译筛选结果" size="xs" color="primary" variant="ghost" :loading="retranslating" title="直接重译当前筛选出的全部条目，适合先筛出未翻译/同文再批量重译" @click="retranslateFiltered" />
              <UButton label="设为原文" size="xs" color="warning" variant="ghost" title="只把选中条目的最终导出设为原文，不改变当前译文" @click="applyBulkOriginal" />
              <UButton label="▲上移" size="xs" color="neutral" variant="ghost" title="所选整行上移" @click="moveSelectedUp" />
              <UButton label="▼下移" size="xs" color="neutral" variant="ghost" title="所选整行下移" @click="moveSelectedDown" />
              <UButton label="保存修改" size="xs" color="neutral" :loading="saving" :disabled="dirtyCount === 0" title="写入核对数据，但不会生成字幕文件" @click="saveChanges()" />
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

          <div class="divide-y divide-gray-100 dark:divide-gray-800 xl:max-h-[72vh] xl:overflow-y-auto">
            <div
              v-for="entry in pagedEntries"
              :key="entry.subtitleId"
              v-memo="[entry.finalText, entry.translatedText, entry.originalText, entry.reviewStatus, entry.reviewReasons?.join(','), entry.selected, entry.edited, entry.asrConfidence, entry.qualityScore, entry.qualityIssues?.join(','), focusedSubtitleId === String(entry.subtitleId)]"
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
                    <UBadge v-if="isReviewTranslationEmpty(entry)" size="sm" color="error" variant="subtle">译文为空</UBadge>
                    <UBadge v-else-if="isReviewSameAsSource(entry)" size="sm" color="warning" variant="subtle">译文与原文相同</UBadge>
                    <UBadge v-if="isReviewFinalDiffersFromTranslation(entry)" size="sm" color="info" variant="subtle">导出已调整</UBadge>
                    <UBadge v-else-if="isReviewFinalSameAsSource(entry) && !isReviewSameAsSource(entry)" size="sm" color="neutral" variant="subtle">导出=原文</UBadge>
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
                    <p class="text-[10px] uppercase tracking-widest text-gray-500 dark:text-gray-400" title="AI 当前译文；重译会覆盖此列">当前译文</p>
                    <div class="flex items-center gap-0.5">
                      <UButton icon="i-lucide-chevron-up" variant="ghost" size="xs" color="neutral" title="译文上移" aria-label="译文上移" @click="shiftTranslation(entry, -1)" />
                      <UButton icon="i-lucide-chevron-down" variant="ghost" size="xs" color="neutral" title="译文下移" aria-label="译文下移" @click="shiftTranslation(entry, 1)" />
                    </div>
                  </div>
                  <p class="text-[13px] leading-6 whitespace-pre-wrap break-words text-gray-800 dark:text-gray-100">{{ entry.translatedText || '—' }}</p>
                </div>
                <div class="rounded-2xl bg-white dark:bg-gray-950/60 border border-primary-100 dark:border-primary-900/40 p-3 space-y-2">
                  <div class="flex items-center justify-between gap-2 flex-wrap">
                    <p class="text-[10px] uppercase tracking-widest text-primary-700" title="此列内容会写入最终字幕文件">最终导出</p>
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
                    placeholder="此列内容会写入字幕文件"
                    @update:model-value="markEdited(entry)"
                  />
                </div>
              </div>
            </div>

            <div v-if="reviewLoading && !entries.length" class="p-8 text-center text-sm text-gray-500 dark:text-gray-400 flex items-center justify-center gap-2">
              <UIcon name="i-lucide-loader-2" class="w-4 h-4 animate-spin" /> 正在加载核对数据...
            </div>
            <div v-else-if="reviewError && !entries.length" class="p-8 text-center text-sm space-y-3">
              <p class="font-medium text-red-600 dark:text-red-400">核对数据加载失败</p>
              <p class="text-xs text-gray-500 dark:text-gray-400">{{ reviewError }}</p>
              <UButton label="重试" size="xs" color="primary" variant="soft" :loading="reviewLoading" @click="retryLoadReview" />
            </div>
            <div v-else-if="!filteredEntries.length" class="p-8 text-center text-sm text-gray-500 dark:text-gray-400 space-y-3">
              <template v-if="summary.total === 0">
                <p class="font-medium text-gray-600 dark:text-gray-300">该任务没有可核对的字幕数据</p>
                <p class="text-xs leading-relaxed">通常是任务在翻译完成前失败、取消，或旧版本导出的「仅原文字幕」任务尚未生成核对记录。</p>
                <UButton label="返回任务" size="xs" color="neutral" variant="soft" :to="`/task/${taskId}`" />
              </template>
              <template v-else>
                <p>当前筛选下暂无字幕条目</p>
                <UButton label="重置筛选" size="xs" color="neutral" variant="soft" @click="resetFilters" />
              </template>
            </div>
          </div>
        </div>
      </div>

      <div class="surface-card hidden overflow-hidden xl:sticky xl:top-4 xl:block">
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

    <UModal v-model:open="guideOpen" title="字幕核对操作指南" description="先筛选，再选择，最后重译或编辑；只有「最终导出」列会写入字幕文件。" :ui="{ content: 'sm:max-w-3xl' }">
      <template #body>
        <div class="max-h-[72vh] space-y-3 overflow-y-auto pr-1 text-sm leading-6 text-gray-700 dark:text-gray-300">
          <section class="rounded-2xl border border-gray-200/70 bg-gray-50/70 p-4 dark:border-gray-800 dark:bg-gray-900/30">
            <p class="font-semibold text-gray-900 dark:text-white">1. 先筛选，再决定处理范围</p>
            <p class="mt-1">搜索框可查原文、译文、最终导出和字幕编号。内容筛选中的「译文与原文相同」会忽略标点、空格、大小写和格式标签，适合找出 AI 没有真正翻译的条目。</p>
            <p class="mt-1">快捷筛选：<span class="font-medium">需要处理</span> 会合并空译文、同文、待核对、低质量、低置信度和有核对原因的条目；<span class="font-medium">未翻译 / 同文</span> 只筛空译文和同文。</p>
          </section>
          <section class="rounded-2xl border border-gray-200/70 bg-gray-50/70 p-4 dark:border-gray-800 dark:bg-gray-900/30">
            <p class="font-semibold text-gray-900 dark:text-white">2. 勾选要处理的条目</p>
            <p class="mt-1">勾选单条后可按住 Shift 再点另一条，连续选中一段。「全选筛选结果」会选中当前筛选出的所有条目（跨页生效）；「反选可见」用于快速切换。</p>
          </section>
          <section class="rounded-2xl border border-primary-100 bg-primary-50/70 p-4 dark:border-primary-900/40 dark:bg-primary-950/20">
            <p class="font-semibold text-primary-900 dark:text-primary-100">3. 重译会覆盖内容</p>
            <p class="mt-1 text-primary-800 dark:text-primary-200">「重译选中」和「重译筛选结果」都会调用当前翻译模型，覆盖这些条目的「当前译文」和「最终导出」，并清除旧质量评分。开始时系统会先保存未保存修改，但随后手动改动仍会被重译结果覆盖，也会产生模型调用费用。</p>
          </section>
          <section class="rounded-2xl border border-gray-200/70 bg-gray-50/70 p-4 dark:border-gray-800 dark:bg-gray-900/30">
            <p class="font-semibold text-gray-900 dark:text-white">4. 三列文本分别是什么</p>
            <ul class="mt-1 list-disc space-y-1 pl-5">
              <li><span class="font-medium">原文</span>：只读，字幕识别或源字幕内容。</li>
              <li><span class="font-medium">当前译文</span>：AI 翻译结果，供对照和恢复使用，不直接导出。</li>
              <li><span class="font-medium">最终导出</span>：可编辑，导出文件实际写入的内容。</li>
            </ul>
            <p class="mt-1">「使用原文」只把最终导出改成原文，适合人名、歌曲、无需翻译的台词；「恢复译文」把最终导出恢复成当前译文。</p>
          </section>
          <section class="rounded-2xl border border-amber-100 bg-amber-50/70 p-4 dark:border-amber-900/40 dark:bg-amber-950/20">
            <p class="font-semibold text-amber-900 dark:text-amber-100">5. 上移 / 下移 / 平移用于修正错位</p>
            <p class="mt-1 text-amber-800 dark:text-amber-200">整行上移下移会改变字幕顺序；「更多调整」里的全局平移和选区平移用于译文整体错位一行的情况。执行前建议先保存或确认当前筛选范围，避免影响未注意到的条目。</p>
          </section>
          <section class="rounded-2xl border border-gray-200/70 bg-gray-50/70 p-4 dark:border-gray-800 dark:bg-gray-900/30">
            <p class="font-semibold text-gray-900 dark:text-white">6. 保存、导出、放弃的区别</p>
            <ul class="mt-1 list-disc space-y-1 pl-5">
              <li><span class="font-medium">保存修改</span>：只写入核对数据，不生成字幕文件。</li>
              <li><span class="font-medium">导出结果</span>：先保存，再生成字幕文件并标记任务完成，然后返回任务页。</li>
              <li><span class="font-medium">放弃成果</span>：把任务标记为失败并作废本次翻译结果，不可撤销。</li>
            </ul>
          </section>
          <section class="rounded-2xl border border-gray-200/70 bg-gray-50/70 p-4 dark:border-gray-800 dark:bg-gray-900/30">
            <p class="font-semibold text-gray-900 dark:text-white">7. AI 校对只给建议</p>
            <p class="mt-1">「AI 校对」不会自动修改字幕，只返回术语建议和一致性问题。可逐条加入术语表，加入后只影响后续新任务，不改变当前任务；若术语表已有不同译法会提示覆盖。</p>
          </section>
          <section class="rounded-2xl border border-gray-200/70 bg-gray-50/70 p-4 dark:border-gray-800 dark:bg-gray-900/30">
            <p class="font-semibold text-gray-900 dark:text-white">8. 键盘快捷键</p>
            <p class="mt-1"><span class="font-mono">J</span> / <span class="font-mono">K</span> 下一条 / 上一条；<span class="font-mono">Enter</span> 编辑当前条最终文本；<span class="font-mono">Ctrl/Cmd + S</span> 保存修改。</p>
          </section>
        </div>
      </template>
      <template #footer>
        <div class="flex w-full justify-end">
          <UButton label="开始操作" color="primary" @click="guideOpen = false" />
        </div>
      </template>
    </UModal>

    <UModal v-model:open="proofreadOpen" title="AI 校对与术语学习" description="用当前翻译模型提取术语或检查译名一致性；只给建议，不会自动修改字幕。">
      <template #body>
        <div class="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
          <div class="rounded-xl border border-primary-100 bg-primary-50/70 p-3 text-xs leading-relaxed text-primary-800 dark:border-primary-900/40 dark:bg-primary-950/20 dark:text-primary-200">
            AI 校对是只读分析：不会改动「当前译文」或「最终导出」。加入术语表只影响后续新任务；一致性问题需要你定位后手动修改或重译。
          </div>
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
                <UButton label="全部加入术语表" icon="i-lucide-plus" size="xs" color="primary" :loading="applyingTerms" title="写入全局术语表，只影响后续任务；已有同名条目会被覆盖" @click="applyProofreadTerms" />
              </div>
              <div class="space-y-2">
                <div v-for="term in proofreadResult.terms" :key="`${term.source}-${term.target}`" class="rounded-xl border border-gray-100 bg-gray-50/70 p-3 dark:border-gray-800 dark:bg-gray-900/30">
                  <div class="flex items-start justify-between gap-2">
                    <div class="min-w-0">
                      <p class="text-sm text-gray-800 dark:text-gray-100"><span class="font-mono">{{ term.source }}</span> → <span class="font-semibold text-primary-700 dark:text-primary-300">{{ term.target }}</span></p>
                      <p v-if="term.reason" class="mt-1 text-xs text-gray-500 dark:text-gray-400">{{ term.reason }}</p>
                      <p v-if="glossaryConflict(term)" class="mt-1 text-[11px] text-amber-700 dark:text-amber-300">术语表已有：{{ glossaryConflict(term) }}（加入后会覆盖）</p>
                      <p v-else-if="glossaryHasTerm(term)" class="mt-1 text-[11px] text-gray-500 dark:text-gray-400">术语表已存在相同译法</p>
                    </div>
                    <UButton label="加入" size="xs" color="primary" variant="ghost" :loading="applyingTerms" @click="applyProofreadTerm(term)" />
                  </div>
                </div>
              </div>
            </div>
            <div v-if="proofreadResult.issues?.length" class="space-y-2">
              <p class="text-sm font-semibold text-amber-800 dark:text-amber-200">一致性问题 {{ proofreadResult.issues.length }} 条</p>
              <p class="text-[11px] text-gray-500 dark:text-gray-400">这些问题不会自动修改。点击「定位」会重置筛选并跳转到对应字幕，可手动修改或重译。</p>
              <div v-for="issue in proofreadResult.issues" :key="`${issue.subtitleId}-${issue.type}-${issue.message}`" class="rounded-xl border border-amber-100 bg-amber-50/70 p-3 dark:border-amber-900/40 dark:bg-amber-950/20">
                <div class="flex items-start justify-between gap-2">
                  <div class="min-w-0">
                    <p class="text-xs font-semibold text-amber-900 dark:text-amber-100">#{{ issue.subtitleId }} · {{ issue.type }}</p>
                    <p class="mt-1 text-xs text-amber-800 dark:text-amber-200">{{ issue.message }}</p>
                  </div>
                  <UButton v-if="issue.subtitleId" label="定位" size="xs" color="warning" variant="ghost" @click="focusIssue(issue)" />
                </div>
              </div>
            </div>
            <div v-if="!proofreadResult.terms?.length && !proofreadResult.issues?.length" class="text-sm text-gray-500 dark:text-gray-400">未发现可建议内容。</div>
          </template>
          <div v-else class="text-sm text-gray-500 dark:text-gray-400">选择上方按钮开始 AI 校对。长片会抽样检查，结果仅供人工确认。</div>
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
import {
  isReviewFinalDiffersFromTranslation,
  isReviewFinalSameAsSource,
  isReviewSameAsSource,
  isReviewTranslationEmpty,
  matchesReviewContentFilter,
  matchesReviewSearch,
  type ReviewContentFilter
} from '~~/shared/reviewFilters'

useHead({
  title: '字幕核对 - SubX'
})

const route = useRoute()
const taskId = String(route.params.id)
const focusedSubtitleId = ref('')
const toast = useToast()
const { confirm } = useConfirm()
const { data: appConfig, refresh: refreshAppConfig } = await useFetch('/api/config')
const qualityThreshold = computed(() => Number(appConfig.value?.qualityScoreThreshold ?? 0.7))
const reviewLoading = ref(true)
const reviewError = ref('')
const skipLeaveConfirm = ref(false)
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
const searchQuery = ref('')
const statusFilter = ref('all')
const contentFilter = ref<ReviewContentFilter>('all')
const reasonFilter = ref('all')
const confidenceFilter = ref('all')
const qualityFilter = ref('all')
const guideOpen = ref(false)
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
  if (!(await confirmOriginalTranslation(kind === 'glossary' ? 'AI 术语建议' : 'AI 一致性检查'))) return
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

function glossaryValue(source: string) {
  const glossary = (appConfig.value as any)?.glossary || {}
  const value = glossary[source]
  return typeof value === 'string' ? value : ''
}

function glossaryConflict(term: any) {
  const existing = glossaryValue(term?.source)
  if (!existing || existing === term?.target) return ''
  return existing
}

function glossaryHasTerm(term: any) {
  const existing = glossaryValue(term?.source)
  return Boolean(existing) && existing === term?.target
}

async function persistGlossaryTerms(terms: any[]) {
  const config: any = await $fetch('/api/config')
  const glossary = { ...(config.glossary || {}) }
  let saved = 0
  for (const term of terms) {
    if (!term?.source || !term?.target) continue
    glossary[term.source] = term.target
    saved += 1
  }
  if (!saved) return 0
  await $fetch('/api/config', { method: 'PUT', body: { glossary } })
  await refreshAppConfig()
  return saved
}

async function applyProofreadTerm(term: any) {
  if (!term?.source || !term?.target) return
  const conflict = glossaryConflict(term)
  if (conflict) {
    const confirmed = await confirm({
      title: '覆盖术语表条目？',
      description: `术语表中「${term.source}」当前是「${conflict}」，加入后会改为「${term.target}」。只影响后续新任务。`,
      confirmLabel: '覆盖并加入',
      color: 'warning'
    })
    if (!confirmed) return
  }
  applyingTerms.value = true
  try {
    const saved = await persistGlossaryTerms([term])
    toast.add({ title: '已加入术语表', description: saved ? `「${term.source}」→「${term.target}」已保存` : '没有可保存的术语', color: 'success' })
  } catch (e: any) {
    toast.add({ title: '保存失败', description: e?.data?.message || e?.message || '无法更新术语表', color: 'error' })
  } finally {
    applyingTerms.value = false
  }
}

async function applyProofreadTerms() {
  const terms = proofreadResult.value?.terms || []
  if (!terms.length) return
  const conflicts = terms.filter((term: any) => glossaryConflict(term))
  const confirmed = await confirm({
    title: `加入 ${terms.length} 个术语？`,
    description: conflicts.length
      ? `其中 ${conflicts.length} 个会覆盖术语表已有译法。术语表只影响后续新任务，不会修改当前字幕。`
      : '术语只写入全局术语表，只影响后续新任务，不会修改当前字幕。',
    confirmLabel: '加入术语表',
    color: conflicts.length ? 'warning' : 'primary'
  })
  if (!confirmed) return
  applyingTerms.value = true
  try {
    const saved = await persistGlossaryTerms(terms)
    toast.add({ title: '已加入术语表', description: `${saved} 个术语已保存，后续任务生效`, color: 'success' })
  } catch (e: any) {
    toast.add({ title: '保存失败', description: e?.data?.message || e?.message || '无法更新术语表', color: 'error' })
  } finally {
    applyingTerms.value = false
  }
}

async function focusIssue(issue: any) {
  const subtitleId = String(issue?.subtitleId || '').trim()
  if (!subtitleId) return
  const index = entries.value.findIndex(entry => String(entry.subtitleId) === subtitleId)
  if (index < 0) {
    toast.add({ title: '未找到对应字幕', description: `AI 返回的 #${subtitleId} 不在当前任务中`, color: 'warning' })
    return
  }
  resetFilters()
  focusedSubtitleId.value = subtitleId
  currentPage.value = Math.floor(index / pageSize.value) + 1
  proofreadOpen.value = false
  await nextTick()
  const target = document.getElementById(`review-entry-${subtitleId}`)
  target?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  target?.focus()
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

const confidenceFilterItems = [
  { label: '全部置信度', value: 'all' },
  { label: '低置信度 <60%', value: 'low' },
  { label: '无置信度', value: 'missing' }
]
const qualityFilterItems = computed(() => {
  const threshold = Math.round(qualityThreshold.value * 100)
  return [
    { label: '全部质量', value: 'all' },
    { label: `低质量 <${threshold}%`, value: 'low' },
    { label: `高质量 ≥${threshold}%`, value: 'high' },
    { label: '未校验', value: 'missing' }
  ]
})

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
  const counts = new Map<string, number>()
  for (const entry of entries.value) {
    for (const reason of entry.reviewReasons || []) {
      const key = String(reason)
      counts.set(key, (counts.get(key) || 0) + 1)
    }
  }
  return [
    { label: '全部原因', value: 'all' },
    ...Array.from(counts.keys()).sort().map(reason => ({
      label: `${reasonLabel(reason)} (${counts.get(reason) || 0})`,
      value: reason
    }))
  ]
})

const filteredEntries = computed(() => {
  let list = entries.value

  list = list.filter(entry => matchesReviewSearch(entry, searchQuery.value))

  if (statusFilter.value === 'needs_review') {
    list = list.filter(entry => reviewStatuses.includes(entry.reviewStatus))
  } else if (statusFilter.value === 'translated') {
    list = list.filter(entry => entry.reviewStatus === 'translated')
  } else if (statusFilter.value === 'accepted_same') {
    list = list.filter(entry => entry.reviewStatus === 'accepted_same')
  } else if (statusFilter.value === 'fallback_original') {
    list = list.filter(entry => entry.reviewStatus === 'fallback_original')
  } else if (statusFilter.value === 'missing') {
    list = list.filter(entry => entry.reviewStatus === 'missing')
  } else if (statusFilter.value === 'edited') {
    list = list.filter(entry => entry.edited)
  } else if (statusFilter.value === 'dirty') {
    list = list.filter(entry => isEntryDirty(entry))
  } else if (statusFilter.value === 'selected') {
    list = list.filter(entry => entry.selected)
  }

  list = list.filter(entry => matchesReviewContentFilter(entry, contentFilter.value, {
    qualityThreshold: qualityThreshold.value
  }))

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

const statusCounts = computed(() => {
  const list = entries.value
  return {
    all: list.length,
    needs_review: list.filter(entry => reviewStatuses.includes(entry.reviewStatus)).length,
    translated: list.filter(entry => entry.reviewStatus === 'translated').length,
    accepted_same: list.filter(entry => entry.reviewStatus === 'accepted_same').length,
    fallback_original: list.filter(entry => entry.reviewStatus === 'fallback_original').length,
    missing: list.filter(entry => entry.reviewStatus === 'missing').length,
    edited: list.filter(entry => entry.edited).length,
    dirty: dirtyEntries.value.length,
    selected: selectedEntries.value.length
  }
})

const statusFilterItems = computed(() => [
  { label: `全部状态 (${statusCounts.value.all})`, value: 'all' },
  { label: `待核对 (${statusCounts.value.needs_review})`, value: 'needs_review' },
  { label: `已翻译 (${statusCounts.value.translated})`, value: 'translated' },
  { label: `同文可接受 (${statusCounts.value.accepted_same})`, value: 'accepted_same' },
  { label: `已回退 (${statusCounts.value.fallback_original})`, value: 'fallback_original' },
  { label: `缺失 (${statusCounts.value.missing})`, value: 'missing' },
  { label: `已编辑 (${statusCounts.value.edited})`, value: 'edited' },
  { label: `待保存 (${statusCounts.value.dirty})`, value: 'dirty' },
  { label: `仅已选 (${statusCounts.value.selected})`, value: 'selected' }
])

const contentCounts = computed(() => {
  const list = entries.value
  const quality = qualityThreshold.value
  return {
    empty: list.filter(entry => isReviewTranslationEmpty(entry)).length,
    same: list.filter(entry => isReviewSameAsSource(entry)).length,
    untranslated: list.filter(entry => matchesReviewContentFilter(entry, 'untranslated')).length,
    finalSame: list.filter(entry => matchesReviewContentFilter(entry, 'final_same_as_source')).length,
    finalDiffers: list.filter(entry => matchesReviewContentFilter(entry, 'final_differs')).length,
    latinHeavy: list.filter(entry => matchesReviewContentFilter(entry, 'latin_heavy')).length,
    overlong: list.filter(entry => matchesReviewContentFilter(entry, 'overlong')).length,
    needsAttention: list.filter(entry => matchesReviewContentFilter(entry, 'needs_attention', { qualityThreshold: quality })).length
  }
})

const contentFilterItems = computed(() => [
  { label: `全部内容 (${entries.value.length})`, value: 'all' },
  { label: `需要处理 (${contentCounts.value.needsAttention})`, value: 'needs_attention' },
  { label: `未翻译 / 同文 (${contentCounts.value.untranslated})`, value: 'untranslated' },
  { label: `译文为空 (${contentCounts.value.empty})`, value: 'empty' },
  { label: `译文与原文相同 (${contentCounts.value.same})`, value: 'same_as_source' },
  { label: `导出与原文相同 (${contentCounts.value.finalSame})`, value: 'final_same_as_source' },
  { label: `导出已调整 (${contentCounts.value.finalDiffers})`, value: 'final_differs' },
  { label: `译文偏原语言 (${contentCounts.value.latinHeavy})`, value: 'latin_heavy' },
  { label: `译文异常偏长 (${contentCounts.value.overlong})`, value: 'overlong' }
])

const hasActiveFilters = computed(() => Boolean(
  searchQuery.value.trim()
  || statusFilter.value !== 'all'
  || contentFilter.value !== 'all'
  || reasonFilter.value !== 'all'
  || confidenceFilter.value !== 'all'
  || qualityFilter.value !== 'all'
))

const activeFilterCount = computed(() => [
  Boolean(searchQuery.value.trim()),
  statusFilter.value !== 'all',
  contentFilter.value !== 'all',
  reasonFilter.value !== 'all',
  confidenceFilter.value !== 'all',
  qualityFilter.value !== 'all'
].filter(Boolean).length)

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

async function confirmLeaveIfDirty() {
  if (dirtyCount.value <= 0) return true
  return await confirm({
    title: '离开字幕核对？',
    description: '当前有未保存修改，离开后会丢失本次编辑。',
    confirmLabel: '放弃修改并离开',
    color: 'warning'
  })
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

function invertVisibleSelection() {
  for (const entry of filteredEntries.value) {
    entry.selected = !entry.selected
  }
  lastClickedIndex.value = -1
}

function clearSelection() {
  for (const entry of entries.value) {
    entry.selected = false
  }
  lastClickedIndex.value = -1
}

function applyFilterPreset(preset: 'needs_attention' | 'untranslated' | 'low_quality' | 'low_confidence' | 'dirty') {
  searchQuery.value = ''
  statusFilter.value = 'all'
  contentFilter.value = 'all'
  reasonFilter.value = 'all'
  confidenceFilter.value = 'all'
  qualityFilter.value = 'all'

  if (preset === 'needs_attention' || preset === 'untranslated') {
    contentFilter.value = preset
  } else if (preset === 'low_quality') {
    qualityFilter.value = 'low'
  } else if (preset === 'low_confidence') {
    confidenceFilter.value = 'low'
  } else if (preset === 'dirty') {
    statusFilter.value = 'dirty'
  }

  currentPage.value = 1
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

async function applyBulkOriginal() {
  const selected = selectedEntries.value
  if (!selected.length) {
    toast.add({ title: '请先选择条目', description: '可以先筛选，再点「全选筛选结果」。', color: 'warning' })
    return
  }
  const confirmed = await confirm({
    title: `将 ${selected.length} 条设为原文？`,
    description: '只会修改这些条目的「最终导出」列，不会改变「当前译文」。保存或导出后才会写入字幕文件。',
    confirmLabel: '设为原文',
    color: 'warning'
  })
  if (!confirmed) return
  for (const entry of selected) {
    useOriginal(entry)
  }
  toast.add({ title: `已将 ${selected.length} 条设为原文`, description: '还需要保存或导出才会生效。', color: 'success' })
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
  reviewLoading.value = true
  reviewError.value = ''
  try {
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
    entries.value = res.entries || []
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
  } catch (error: any) {
    reviewError.value = error?.data?.message || error?.message || '无法加载核对数据'
    throw error
  } finally {
    reviewLoading.value = false
  }
}

async function retryLoadReview() {
  try {
    await loadReview()
    await loadPreview()
  } catch {
    // loadReview 已记录错误状态
  }
}

function openPreview() {
  previewOpen.value = true
  loadPreview()
}

function resetFilters() {
  searchQuery.value = ''
  statusFilter.value = 'all'
  contentFilter.value = 'all'
  reasonFilter.value = 'all'
  confidenceFilter.value = 'all'
  qualityFilter.value = 'all'
  currentPage.value = 1
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
  const changedEntries = dirtyEntries.value.map((entry) => ({
    subtitleId: entry.subtitleId,
    translatedText: entry.translatedText,
    finalText: entry.finalText,
    reviewStatus: entry.reviewStatus,
    sortOrder: entries.value.indexOf(entry),
    selected: entry.selected,
    edited: entry.edited
  }))

  if (!changedEntries.length) {
    if (showToast) toast.add({ title: '当前没有需要保存的修改', description: '编辑「最终导出」或勾选条目后才会产生待保存内容。', color: 'neutral' })
    return
  }

  saving.value = true
  try {
    await $fetch(`/api/tasks/${taskId}/review`, {
      method: 'PATCH',
      body: { entries: changedEntries, bilingualLayout: bilingualLayout.value }
    })
    if (showToast) toast.add({ title: `已保存 ${changedEntries.length} 条修改`, description: '尚未生成字幕文件；需要时再点「导出结果」。', color: 'success' })
    await Promise.all([loadReview(), loadPreview()])
  } catch (error: any) {
    toast.add({ title: '保存失败', description: error?.data?.message || error?.message || '请稍后重试', color: 'error' })
    throw error
  } finally {
    saving.value = false
  }
}

async function confirmOriginalTranslation(action: string) {
  if (taskMeta.outputMode !== 'original') return true
  return await confirm({
    title: '仅原文字幕任务',
    description: `${action}会调用翻译模型并写入当前核对数据。`,
    confirmLabel: '继续',
    color: 'warning'
  })
}

async function confirmRetranslate(count: number, scope: string) {
  return await confirm({
    title: `重译${scope} ${count} 条字幕？`,
    description: '会调用当前翻译模型，覆盖这些条目的「当前译文」和「最终导出」，并清除旧质量评分。手动修改会被覆盖，长片批量重译可能产生较多模型费用。',
    confirmLabel: '开始重译',
    color: 'warning'
  })
}

async function retranslateIds(subtitleIds: string[]) {
  if (!subtitleIds.length) return
  const result: any = await $fetch(`/api/tasks/${taskId}/review-retranslate`, {
    method: 'POST',
    body: { subtitleIds }
  })
  await Promise.all([loadReview(), loadPreview()])
  const count = Array.isArray(result?.entries) ? result.entries.length : subtitleIds.length
  toast.add({ title: `已重译 ${count} 条字幕`, description: '当前译文和最终导出已更新，可继续校对或导出。', color: 'success' })
}

async function retranslateSelected() {
  const ids = selectedEntries.value.map(entry => String(entry.subtitleId))
  if (!ids.length) {
    toast.add({ title: '请先选择要重译的字幕', description: '可以勾选单条，或先筛选再点「全选筛选结果」。', color: 'warning' })
    return
  }
  if (!(await confirmRetranslate(ids.length, '选中的'))) return
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

async function retranslateFiltered() {
  const ids = filteredEntries.value.map(entry => String(entry.subtitleId))
  if (!ids.length) {
    toast.add({ title: '当前筛选没有字幕', description: '请先调整筛选条件，再重译筛选结果。', color: 'warning' })
    return
  }
  if (!(await confirmRetranslate(ids.length, '当前筛选的'))) return
  retranslating.value = true
  try {
    await saveChanges(false)
    await retranslateIds(ids)
  } catch (error: any) {
    toast.add({ title: '筛选结果重译失败', description: error?.data?.message || error?.message || '请稍后重试', color: 'error' })
  } finally {
    retranslating.value = false
  }
}

async function retranslateSingle(entry: any) {
  if (!(await confirmOriginalTranslation('单条重译'))) return
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
    toast.add({ title: '已保存并导出最终字幕', description: '字幕文件已生成，任务将标记为完成。', color: 'success' })
    await navigateTo(`/task/${taskId}`)
  } catch (error: any) {
    toast.add({ title: '导出失败', description: error?.data?.message || error?.message || '请稍后重试', color: 'error' })
  } finally {
    exporting.value = false
  }
}

async function discardReview() {
  const confirmed = await confirm({
    title: '放弃本次翻译成果？',
    description: dirtyCount.value > 0
      ? `当前有 ${dirtyCount.value} 条未保存修改也会一并丢弃。任务会被标记为失败，此操作不可撤销。`
      : '任务会被标记为失败，本次翻译结果将作废，此操作不可撤销。',
    confirmLabel: '放弃成果',
    color: 'error'
  })
  if (!confirmed) return
  try {
    await $fetch(`/api/tasks/${taskId}/review-discard`, { method: 'POST' })
    skipLeaveConfirm.value = true
    toast.add({ title: '已放弃本次翻译成果', description: '任务已标记为失败，可在翻译历史中重新翻译。', color: 'warning' })
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

watch([searchQuery, statusFilter, contentFilter, reasonFilter, confidenceFilter, qualityFilter], () => {
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
  if (skipLeaveConfirm.value) return true
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
    void saveChanges().catch(() => {})
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
