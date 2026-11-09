<template>
  <AppContainer size="wide" class="space-y-4 py-2">
    <PageHeader
      title="字幕核对"
      description="筛选、重译、修正并预览最终字幕。"
      :breadcrumb="[{ label: '翻译历史', icon: 'i-lucide-history', to: '/history' }, { label: '字幕核对' }]"
    >
      <template #actions>
        <UButton icon="i-lucide-help-circle" color="neutral" variant="ghost" size="sm" aria-label="操作指南" title="操作指南" @click="guideOpen = true" />
        <UButton
          :label="proofreadIssueCount ? `AI 校对 ${proofreadIssueCount}` : 'AI 校对'"
          icon="i-lucide-sparkles"
          color="primary"
          variant="soft"
          size="sm"
          title="只生成术语与一致性建议，不会自动修改字幕"
          @click="openProofread"
        />
        <UPopover v-model:open="moreMenuOpen" :content="{ align: 'end' }">
          <UButton icon="i-lucide-ellipsis" color="neutral" variant="ghost" size="sm" aria-label="更多操作" title="更多操作" />
          <template #content>
            <div class="w-48 p-1">
              <UButton label="返回任务" icon="i-lucide-arrow-left" color="neutral" variant="ghost" class="w-full justify-start" :to="`/task/${taskId}`" @click="moreMenuOpen = false" />
              <UButton label="放弃成果" icon="i-lucide-trash-2" color="error" variant="ghost" class="w-full justify-start" @click="moreMenuOpen = false; discardReview()" />
            </div>
          </template>
        </UPopover>
        <UPopover v-model:open="exportSettingsOpen" :content="{ align: 'end' }">
          <UButton icon="i-lucide-sliders-horizontal" label="导出设置" color="neutral" variant="ghost" size="sm" title="设置导出模式、字幕样式和格式" />
          <template #content>
            <div class="w-80 max-w-[calc(100vw-2rem)] space-y-3 p-3">
              <div class="flex items-center justify-between gap-2">
                <p class="app-section-title">导出设置</p>
                <UButton label="预览" icon="i-lucide-eye" size="xs" color="neutral" variant="ghost" @click="exportSettingsOpen = false; openPreview()" />
              </div>
              <UFormField label="导出模式">
                <USelect v-model="exportMode" :items="exportModeItems" size="sm" class="w-full" />
              </UFormField>
              <UFormField label="字幕样式">
                <USelect v-model="exportStyle" :items="exportStyleItems" size="sm" class="w-full" />
              </UFormField>
              <UFormField label="导出格式">
                <USelect v-model="exportFormat" :items="exportFormatItems" size="sm" class="w-full" />
              </UFormField>
              <UFormField label="双语布局">
                <USelect v-model="bilingualLayout" :items="bilingualLayoutItems" size="sm" class="w-full" :disabled="exportMode !== 'bilingual'" />
              </UFormField>
              <UButton label="高级样式" icon="i-lucide-palette" size="xs" color="primary" variant="soft" class="w-full justify-center" @click="exportSettingsOpen = false; styleDrawerOpen = true" />
              <p class="app-caption">导出前会自动保存当前修改。文件内容以每条字幕的「最终导出」列为准；「当前译文」只用于恢复和重译参考。</p>
            </div>
          </template>
        </UPopover>
        <UButton label="导出结果" color="primary" size="sm" :loading="exporting" title="先保存当前修改，再生成字幕文件并返回任务页" @click="exportReviewed" />
      </template>
    </PageHeader>

    <div v-if="taskMeta.outputMode === 'original' && summary.total > 0" class="rounded-xl border border-amber-200 bg-amber-50/80 px-3 py-2 text-xs leading-relaxed text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-200">
      该任务为「仅原文字幕」：核对页用于查看、编辑和导出原始字幕。重译 / AI 校对会调用翻译模型，是否使用由你决定。
    </div>

    <div v-if="clipUrl" class="space-y-2 rounded-2xl border border-primary-100 bg-primary-50/60 p-3 dark:border-primary-900/40 dark:bg-primary-950/20">
      <div class="flex items-center justify-between gap-2">
        <p class="text-xs font-semibold text-primary-800 dark:text-primary-200">音频片段 #{{ clipEntryId }} · {{ clipRangeText }}</p>
        <UButton icon="i-lucide-x" size="xs" color="neutral" variant="ghost" aria-label="关闭音频片段" @click="closeClip" />
      </div>
      <audio :src="clipUrl" controls autoplay class="w-full" aria-label="字幕音频片段"></audio>
    </div>

    <div class="surface-card space-y-3 p-3 sm:p-4">
      <div class="flex flex-wrap items-center gap-2">
        <UInput v-model="searchQuery" icon="i-lucide-search" size="sm" placeholder="搜索原文 / 译文 / 编号" class="w-full sm:w-56" aria-label="搜索字幕内容" />
        <UButton
          :label="`需要处理 ${contentCounts.needsAttention}`"
          size="sm"
          color="warning"
          :variant="contentFilter === 'needs_attention' ? 'soft' : 'ghost'"
          :aria-pressed="contentFilter === 'needs_attention'"
          title="空译文、同文、待核对、低质量、低置信度或有核对原因的条目"
          @click="toggleFilterPreset('needs_attention')"
        />
        <UButton
          :label="`未翻译 / 同文 ${contentCounts.untranslated}`"
          size="sm"
          color="error"
          :variant="contentFilter === 'untranslated' ? 'soft' : 'ghost'"
          :aria-pressed="contentFilter === 'untranslated'"
          title="译文为空，或译文与原文完全相同"
          @click="toggleFilterPreset('untranslated')"
        />
        <UButton
          v-if="proofreadIssueCount"
          :label="`AI 问题 ${proofreadIssueCount}`"
          size="sm"
          color="warning"
          :variant="proofreadIssueFilter !== 'all' ? 'soft' : 'ghost'"
          :aria-pressed="proofreadIssueFilter !== 'all'"
          title="只看 AI 一致性问题涉及的字幕"
          @click="toggleProofreadIssueFilter"
        />
        <UButton
          label="低质量"
          size="sm"
          color="warning"
          :variant="qualityFilter === 'low' ? 'soft' : 'ghost'"
          :aria-pressed="qualityFilter === 'low'"
          title="质量分低于设置阈值"
          @click="toggleFilterPreset('low_quality')"
        />
        <UButton
          label="待保存"
          size="sm"
          color="neutral"
          :variant="statusFilter === 'dirty' ? 'soft' : 'ghost'"
          :aria-pressed="statusFilter === 'dirty'"
          title="只看尚未保存的修改"
          @click="toggleFilterPreset('dirty')"
        />

        <UPopover v-model:open="filterPanelOpen" :content="{ align: 'start' }">
          <UButton
            label="筛选"
            icon="i-lucide-sliders-horizontal"
            size="sm"
            color="neutral"
            :variant="advancedFilterCount ? 'soft' : 'ghost'"
            :title="advancedFilterCount ? `已启用 ${advancedFilterCount} 个高级筛选` : '打开高级筛选'"
          />
          <template #content>
            <div class="w-[22rem] max-w-[calc(100vw-2rem)] space-y-3 p-3">
              <div class="flex items-center justify-between gap-2">
                <p class="app-section-title">高级筛选</p>
                <UButton label="重置" icon="i-lucide-filter-x" size="xs" color="neutral" variant="ghost" :disabled="!advancedFilterCount" @click="resetAdvancedFilters" />
              </div>
              <UFormField label="状态筛选">
                <USelect v-model="statusFilter" :items="statusFilterItems" size="sm" class="w-full" />
              </UFormField>
              <UFormField label="内容筛选">
                <USelect v-model="contentFilter" :items="contentFilterItems" size="sm" class="w-full" />
              </UFormField>
              <UFormField label="原因筛选">
                <USelect v-model="reasonFilter" :items="reasonFilterItems" size="sm" class="w-full" />
              </UFormField>
              <UFormField label="ASR 置信度">
                <USelect v-model="confidenceFilter" :items="confidenceFilterItems" size="sm" class="w-full" />
              </UFormField>
              <UFormField label="翻译质量">
                <USelect v-model="qualityFilter" :items="qualityFilterItems" size="sm" class="w-full" />
              </UFormField>
              <UFormField v-if="proofreadIssueCount" label="AI 校对问题">
                <USelect v-model="proofreadIssueFilter" :items="proofreadIssueFilterItems" size="sm" class="w-full" />
              </UFormField>
              <p class="app-caption">译文与原文相同会忽略标点、空格、大小写和格式标签。AI 问题来自一致性检查缓存。</p>
            </div>
          </template>
        </UPopover>
        <UButton v-if="hasActiveFilters" label="清空筛选" icon="i-lucide-filter-x" size="sm" color="neutral" variant="ghost" @click="resetFilters" />
      </div>

      <div class="flex flex-wrap items-center gap-2 border-t border-gray-100 pt-3 text-xs text-gray-500 dark:border-gray-800 dark:text-gray-400">
        <span>已选 {{ selectedEntries.length }}</span>
        <span v-if="dirtyCount > 0" class="text-primary-700 dark:text-primary-300">待保存 {{ dirtyCount }}</span>
        <span v-if="hasActiveFilters" class="text-primary-600 dark:text-primary-400">已启用 {{ activeFilterCount }} 个筛选</span>

        <div class="ml-auto flex flex-wrap items-center gap-1.5">
          <UButton label="全选筛选结果" size="xs" color="neutral" variant="ghost" title="选中当前筛选出的所有条目（跨页生效）" @click="selectVisible" />
          <UButton label="反选" size="xs" color="neutral" variant="ghost" title="反转当前筛选结果的选中状态" @click="invertVisibleSelection" />
          <UButton label="清空选择" size="xs" color="neutral" variant="ghost" @click="clearSelection" />
          <span class="mx-1 hidden h-4 w-px bg-gray-200 dark:bg-gray-700 sm:block" />
          <UButton label="重译选中" size="xs" color="primary" variant="soft" :loading="retranslating" title="对已勾选条目调用模型重译；会覆盖当前译文和最终导出" @click="retranslateSelected" />
          <UButton label="重译筛选" size="xs" color="primary" variant="ghost" :loading="retranslating" title="直接重译当前筛选出的全部条目" @click="retranslateFiltered" />
          <UButton label="设为原文" size="xs" color="warning" variant="ghost" title="只把选中条目的最终导出设为原文，不改变当前译文" @click="applyBulkOriginal" />
          <UPopover :content="{ align: 'end' }">
            <UButton label="更多" icon="i-lucide-ellipsis" size="xs" color="neutral" variant="ghost" title="顺序与错位修正" />
            <template #content>
              <div class="w-64 space-y-1 p-2">
                <p class="section-title px-2 py-1">顺序调整</p>
                <UButton label="所选上移" icon="i-lucide-arrow-up" size="xs" color="neutral" variant="ghost" class="w-full justify-start" @click="moveSelectedUp" />
                <UButton label="所选下移" icon="i-lucide-arrow-down" size="xs" color="neutral" variant="ghost" class="w-full justify-start" @click="moveSelectedDown" />
                <p class="section-title px-2 pb-1 pt-2">译文平移</p>
                <UButton label="从选中处下移" icon="i-lucide-arrow-down" size="xs" color="neutral" variant="ghost" class="w-full justify-start" @click="shiftAllCol('translatedText', 1)" />
                <UButton label="从选中处上移" icon="i-lucide-arrow-up" size="xs" color="neutral" variant="ghost" class="w-full justify-start" @click="shiftAllCol('translatedText', -1)" />
                <UButton label="选区内下移" icon="i-lucide-arrow-down" size="xs" color="neutral" variant="ghost" class="w-full justify-start" @click="batchShiftCol('translatedText', 1)" />
                <UButton label="选区内上移" icon="i-lucide-arrow-up" size="xs" color="neutral" variant="ghost" class="w-full justify-start" @click="batchShiftCol('translatedText', -1)" />
                <p class="section-title px-2 pb-1 pt-2">导出文本</p>
                <UButton label="恢复译文" icon="i-lucide-rotate-ccw" size="xs" color="primary" variant="ghost" class="w-full justify-start" @click="batchRestoreTranslated" />
                <UButton label="导出文本下移" icon="i-lucide-arrow-down" size="xs" color="primary" variant="ghost" class="w-full justify-start" @click="shiftAllCol('finalText', 1)" />
                <UButton label="导出文本上移" icon="i-lucide-arrow-up" size="xs" color="primary" variant="ghost" class="w-full justify-start" @click="shiftAllCol('finalText', -1)" />
              </div>
            </template>
          </UPopover>
          <UButton label="保存修改" size="xs" color="neutral" :loading="saving" :disabled="dirtyCount === 0" title="写入核对数据，但不会生成字幕文件" @click="saveChanges()" />
        </div>
      </div>
    </div>

    <div class="grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
      <div class="min-w-0">
        <div class="surface-card overflow-hidden">
          <div class="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 px-3 py-2 text-xs text-gray-500 dark:border-gray-800 dark:text-gray-400">
            <span>共 {{ summary.total }} 条 · 筛选结果 {{ filteredEntries.length }} 条 · 第 {{ currentPage }} / {{ totalPages }} 页</span>
            <div class="flex items-center gap-2">
              <USelect v-model="pageSize" :items="pageSizeItems" size="xs" class="w-24" aria-label="每页条数" />
              <UButton label="上一页" size="xs" color="neutral" variant="ghost" :disabled="currentPage <= 1" @click="currentPage -= 1" />
              <UButton label="下一页" size="xs" color="neutral" variant="ghost" :disabled="currentPage >= totalPages" @click="currentPage += 1" />
            </div>
          </div>

          <div class="divide-y divide-gray-100 dark:divide-gray-800 xl:max-h-[calc(100vh-12rem)] xl:overflow-y-auto">
            <ReviewEntryCard
              v-for="entry in pagedEntries"
              :key="entry.subtitleId"
              v-memo="[entry.finalText, entry.translatedText, entry.originalText, entry.reviewStatus, entry.reviewReasons?.join(','), entry.selected, entry.edited, entry.asrConfidence, entry.qualityScore, entry.qualityIssues?.join(','), focusedSubtitleId === String(entry.subtitleId), proofreadRevision]"
              :id="`review-entry-${entry.subtitleId}`"
              tabindex="-1"
              :entry="entry"
              :focused="focusedSubtitleId === String(entry.subtitleId)"
              :proofread-issues="proofreadIssueList(entry)"
              :quality-threshold="qualityThreshold"
              :retranslating="retranslatingSingleId === entry.subtitleId"
              @toggle-select="onCheckboxClick"
              @move-up="moveUp"
              @move-down="moveDown"
              @play="playClip"
              @retranslate="retranslateSingle"
              @shift-translation="shiftTranslation"
              @shift-final="shiftFinal"
              @restore-translated="restoreTranslated"
              @use-original="useOriginal"
              @update-final="updateFinalText"
            />

            <div v-if="reviewLoading && !entries.length" class="flex items-center justify-center gap-2 p-8 text-center text-sm text-gray-500 dark:text-gray-400">
              <UIcon name="i-lucide-loader-2" class="h-4 w-4 animate-spin" /> 正在加载核对数据...
            </div>
            <div v-else-if="reviewError && !entries.length" class="space-y-3 p-8 text-center text-sm">
              <p class="font-medium text-red-600 dark:text-red-400">核对数据加载失败</p>
              <p class="text-xs text-gray-500 dark:text-gray-400">{{ reviewError }}</p>
              <UButton label="重试" size="xs" color="primary" variant="soft" :loading="reviewLoading" @click="retryLoadReview" />
            </div>
            <div v-else-if="!filteredEntries.length" class="space-y-3 p-8 text-center text-sm text-gray-500 dark:text-gray-400">
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

      <div class="surface-card hidden max-h-[calc(100vh-2rem)] flex-col overflow-hidden xl:sticky xl:top-4 xl:flex">
        <div class="flex items-center gap-1 border-b border-gray-100 p-2 dark:border-gray-800">
          <button
            type="button"
            class="rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors"
            :aria-pressed="rightPanelTab === 'preview'"
            :class="rightPanelTab === 'preview' ? 'bg-primary-50 text-primary-700 dark:bg-primary-500/10 dark:text-primary-300' : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'"
            @click="rightPanelTab = 'preview'"
          >
            实时预览
          </button>
          <button
            type="button"
            class="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors"
            :aria-pressed="rightPanelTab === 'proofread'"
            :class="rightPanelTab === 'proofread' ? 'bg-primary-50 text-primary-700 dark:bg-primary-500/10 dark:text-primary-300' : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'"
            @click="switchRightPanel('proofread')"
          >
            AI 校对
            <UBadge v-if="proofreadIssueCount" color="warning" variant="subtle">{{ proofreadIssueCount }}</UBadge>
          </button>
          <UButton v-if="rightPanelTab === 'preview'" label="刷新" size="xs" color="neutral" variant="ghost" class="ml-auto" :loading="previewLoading" @click="loadPreview" />
        </div>

        <div v-if="rightPanelTab === 'preview'" class="min-h-0 flex-1 overflow-y-auto">
          <div class="flex flex-wrap items-center gap-2 border-b border-gray-100 px-3 py-2 dark:border-gray-800">
            <USelect v-model="previewFormat" :items="previewFormatItems" size="xs" class="w-24" aria-label="预览格式" />
            <USelect v-model="bilingualLayout" :items="bilingualLayoutItems" size="xs" class="w-32" aria-label="双语布局" />
            <span class="text-[11px] text-gray-500 dark:text-gray-400">{{ previewFormat === 'ass' ? 'ASS 样式预览' : 'SRT 文本预览' }}</span>
          </div>
          <div class="p-3">
            <div v-if="previewLoading" class="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
              <UIcon name="i-lucide-loader-2" class="h-4 w-4 animate-spin" /> 正在生成预览...
            </div>
            <pre v-else tabindex="0" aria-label="字幕预览内容" class="max-h-[calc(100vh-12rem)] overflow-y-auto whitespace-pre-wrap break-words text-xs leading-5 text-gray-800 dark:text-gray-100">{{ previewContent || '暂无预览内容' }}</pre>
          </div>
        </div>

        <div v-if="rightPanelTab === 'proofread'" class="min-h-0 flex-1 overflow-y-auto">
          <ReviewProofreadPanel
            :kind="proofreadKind"
            :state="proofreadStates[proofreadKind]"
            :glossary="(appConfig as any)?.glossary || {}"
            :issue-types="proofreadIssueTypes"
            :issue-count="proofreadIssueCount"
            :issue-filter="proofreadIssueFilter"
            :applying-terms="applyingTerms"
            :other-terms="proofreadKind === 'consistency' ? (proofreadStates.glossary.result?.terms || []) : []"
            @update:kind="switchProofreadKind"
            @generate="(refresh) => generateProofread(proofreadKind, refresh)"
            @focus-issue="focusIssue"
            @focus-subtitle="focusSubtitle"
            @filter-issues="filterProofreadIssues"
            @select-issues="selectProofreadIssues"
            @retranslate-issues="retranslateProofreadIssues"
            @apply-term="applyProofreadTerm"
            @apply-terms="applyProofreadTerms"
          />
        </div>
      </div>
    </div>

    <ReviewGuideModal v-model:open="guideOpen" />

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

    <USlideover v-model:open="styleDrawerOpen" title="字幕高级样式" description="分别调整原文与译文的字体、字号、颜色和描边；SRT 仅保留文本与换行。" :ui="{ content: 'w-full sm:max-w-3xl' }">
      <template #body>
        <SubtitleStyleEditor
          :model-value="exportSubtitleStyle"
          :output-mode="exportMode"
          :subtitle-format="exportFormat"
          :bilingual-layout="bilingualLayout"
          @update:model-value="updateExportStyle"
        />
      </template>
    </USlideover>

    <USlideover v-model:open="proofreadDrawerOpen" title="AI 校对与术语学习" description="只给建议，不会自动修改字幕；结果会缓存。" :ui="{ content: 'w-full sm:max-w-xl' }">
      <template #body>
        <ReviewProofreadPanel
          class="h-[75vh]"
          :kind="proofreadKind"
          :state="proofreadStates[proofreadKind]"
          :glossary="(appConfig as any)?.glossary || {}"
          :issue-types="proofreadIssueTypes"
          :issue-count="proofreadIssueCount"
          :issue-filter="proofreadIssueFilter"
          :applying-terms="applyingTerms"
          :other-terms="proofreadKind === 'consistency' ? (proofreadStates.glossary.result?.terms || []) : []"
          @update:kind="switchProofreadKind"
          @generate="(refresh) => generateProofread(proofreadKind, refresh)"
          @focus-issue="focusIssue"
          @focus-subtitle="focusSubtitle"
          @filter-issues="filterProofreadIssues"
          @select-issues="selectProofreadIssues"
          @retranslate-issues="retranslateProofreadIssues"
          @apply-term="applyProofreadTerm"
          @apply-terms="applyProofreadTerms"
        />
      </template>
    </USlideover>
  </AppContainer>
</template>

<script setup lang="ts">
definePageMeta({ key: route => String(route.params.id || '') })
import {
  proofreadIssueLabel,
  reviewReasonLabel as reasonLabel
} from '~~/shared/reviewLabels'
import { createSubtitleStyle, getSubtitleStylePresetOptions, normalizeSubtitleStyle, normalizeSubtitleStylePreset } from '~~/shared/subtitleStyles'
import type { SubtitleOutputStyle } from '~~/types'
import SubtitleStyleEditor from '~/components/SubtitleStyleEditor.vue'
import {
  isReviewFinalDiffersFromTranslation,
  isReviewFinalSameAsSource,
  isReviewLatinHeavy,
  isReviewNeedsAttention,
  isReviewOverlong,
  isReviewSameAsSource,
  isReviewTranslationEmpty,
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
const { data: appConfig, refresh: refreshAppConfig } = await useAppConfigData()
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
type ProofreadKind = 'glossary' | 'consistency'
interface ProofreadState {
  result: any | null
  meta: any | null
  loading: boolean
  cacheLoading: boolean
}
const proofreadStates = reactive<Record<ProofreadKind, ProofreadState>>({
  glossary: { result: null, meta: null, loading: false, cacheLoading: false },
  consistency: { result: null, meta: null, loading: false, cacheLoading: false }
})
const proofreadKind = ref<ProofreadKind>('consistency')
const proofreadRevision = ref(0)
const proofreadIssueFilter = ref('all')
const proofreadDrawerOpen = ref(false)
const applyingTerms = ref(false)
const rightPanelTab = ref<'preview' | 'proofread'>('preview')
const filterPanelOpen = ref(false)
const exportSettingsOpen = ref(false)
const moreMenuOpen = ref(false)
const previewLoading = ref(false)
let previewRequestId = 0
let previewDebounceTimer: ReturnType<typeof setTimeout> | null = null
const previewContent = ref('')
const previewOpen = ref(false)
const previewFormat = ref<'srt' | 'ass'>('srt')
const bilingualLayout = ref<'translated_first' | 'original_first'>('translated_first')
const exportMode = ref<'translated' | 'bilingual' | 'original'>('translated')
const exportStyle = ref<string>('mono_clean')
const exportFormat = ref<'srt' | 'ass'>('srt')
const taskSubtitleStyle = ref<SubtitleOutputStyle | undefined>()
const styleDrawerOpen = ref(false)
const searchQuery = ref('')
const debouncedSearchQuery = ref('')
let searchDebounceTimer: ReturnType<typeof setTimeout> | null = null
watch(searchQuery, (value) => {
  if (searchDebounceTimer) clearTimeout(searchDebounceTimer)
  searchDebounceTimer = setTimeout(() => { debouncedSearchQuery.value = value }, 150)
})
const statusFilter = ref('all')
const contentFilter = ref<ReviewContentFilter>('all')
const reasonFilter = ref('all')
const confidenceFilter = ref('all')
const qualityFilter = ref('all')
const guideOpen = ref(false)
const pageSize = ref(50)
const currentPage = ref(1)
const pageSizeItems = [
  { label: '20 条/页', value: 20 },
  { label: '50 条/页', value: 50 },
  { label: '100 条/页', value: 100 },
  { label: '200 条/页', value: 200 }
]
const summary = reactive({ total: 0, needsReview: 0, edited: 0 })
const entries = ref<any[]>([])
const taskMeta = reactive({ outputMode: 'translated', bilingualLayout: 'translated_first' as 'translated_first' | 'original_first' })
const lastClickedIndex = ref(-1)
const entrySnapshots = ref<Record<string, { translatedText: string, finalText: string, reviewStatus: string, edited: boolean }>>({})

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

function applyProofreadPayload(kind: ProofreadKind, payload: any) {
  const state = proofreadStates[kind]
  if (!payload || payload.available === false) {
    state.result = null
    state.meta = null
  } else {
    state.result = {
      terms: Array.isArray(payload.terms) ? payload.terms : [],
      issues: Array.isArray(payload.issues) ? payload.issues : []
    }
    state.meta = {
      cached: payload.cached === true,
      stale: payload.stale === true,
      cachedAt: payload.cachedAt || null,
      model: payload.model || '',
      entryCount: Number(payload.entryCount || 0),
      totalEntries: Number(payload.totalEntries || 0)
    }
  }
  if (kind === 'consistency') {
    proofreadRevision.value += 1
    if (!state.result?.issues?.length) proofreadIssueFilter.value = 'all'
  }
}

async function loadCachedProofread(kind: ProofreadKind, silent = false) {
  const state = proofreadStates[kind]
  if (state.cacheLoading || state.loading) return
  state.cacheLoading = true
  try {
    const res: any = await $fetch(`/api/tasks/${taskId}/proofread`, { query: { kind } })
    applyProofreadPayload(kind, res)
  } catch (e: any) {
    if (!silent) {
      toast.add({ title: '读取 AI 校对缓存失败', description: e?.data?.message || e?.message || '请稍后重试', color: 'error' })
    }
  } finally {
    state.cacheLoading = false
  }
}

async function refreshProofreadCacheState() {
  if (!proofreadStates.consistency.result && !proofreadStates.consistency.meta) return
  await loadCachedProofread('consistency', true)
}

async function generateProofread(kind: ProofreadKind, refresh: boolean) {
  const state = proofreadStates[kind]
  if (state.loading) return
  const confirmed = await confirm({
    title: refresh ? '重新执行 AI 校对？' : '开始 AI 校对？',
    description: refresh
      ? '会再次调用当前翻译模型分析抽样字幕，并覆盖已有缓存建议。会产生新的 Token 费用，但不会修改当前字幕。'
      : '会调用当前翻译模型分析抽样字幕。结果会自动缓存，后续打开不会重复消耗 Token，也不会修改当前字幕。',
    confirmLabel: refresh ? '重新校对' : '开始校对',
    color: 'warning'
  })
  if (!confirmed) return
  state.loading = true
  try {
    const res: any = await $fetch(`/api/tasks/${taskId}/proofread`, {
      method: 'POST',
      body: { kind, refresh }
    })
    applyProofreadPayload(kind, res)
    toast.add({
      title: res?.cached ? '已使用缓存结果' : 'AI 校对完成',
      description: res?.cached ? '没有重复调用模型。' : '建议已缓存，重新进入页面不会重复消耗 Token。',
      color: 'success'
    })
  } catch (e: any) {
    toast.add({ title: 'AI 校对失败', description: e?.data?.message || e?.message || '无法完成校对', color: 'error' })
  } finally {
    state.loading = false
  }
}

function switchProofreadKind(kind: ProofreadKind) {
  proofreadKind.value = kind
  if (!proofreadStates[kind].result && !proofreadStates[kind].meta) {
    loadCachedProofread(kind, true)
  }
}

function switchRightPanel(tab: 'preview' | 'proofread') {
  rightPanelTab.value = tab
  if (tab === 'proofread' && !proofreadStates[proofreadKind.value].result && !proofreadStates[proofreadKind.value].meta) {
    loadCachedProofread(proofreadKind.value, true)
  }
}

function openProofread() {
  if (!proofreadStates[proofreadKind.value].result && !proofreadStates[proofreadKind.value].meta) {
    loadCachedProofread(proofreadKind.value, true)
  }
  const desktop = typeof window !== 'undefined' && window.matchMedia('(min-width: 1280px)').matches
  if (desktop) {
    rightPanelTab.value = 'proofread'
  } else {
    proofreadDrawerOpen.value = true
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

function proofreadTermKey(term: any) {
  return `${String(term?.source || '')}\u0000${String(term?.target || '')}`
}

const currentProofreadTermsForApply = computed(() => {
  const terms = proofreadStates[proofreadKind.value].result?.terms || []
  if (proofreadKind.value !== 'consistency') return terms
  const glossaryTerms = proofreadStates.glossary.result?.terms || []
  if (!glossaryTerms.length) return terms
  const merged = new Map<string, any>()
  for (const term of [...glossaryTerms, ...terms]) {
    const key = proofreadTermKey(term)
    if (!merged.has(key)) merged.set(key, term)
  }
  return Array.from(merged.values())
})

async function applyProofreadTerms() {
  const terms = currentProofreadTermsForApply.value
  if (!terms.length) return

  let added = 0
  let overwritten = 0
  let existing = 0
  for (const term of terms) {
    const current = glossaryValue(term.source)
    if (!current) added += 1
    else if (current === term.target) existing += 1
    else overwritten += 1
  }
  const summary = [
    added ? `新增 ${added}` : '',
    overwritten ? `覆盖 ${overwritten}` : '',
    existing ? `已存在 ${existing}` : ''
  ].filter(Boolean).join('，')
  const mergedExtra = terms.length - (proofreadStates[proofreadKind.value].result?.terms?.length || 0)

  const confirmed = await confirm({
    title: `加入 ${terms.length} 个术语？`,
    description: `${mergedExtra > 0 ? `已合并术语提取建议中的 ${mergedExtra} 条术语。` : ''}将写入全局术语表：${summary || '无变化'}。术语表只影响后续新任务，不会修改当前字幕。`,
    confirmLabel: overwritten ? '覆盖并加入' : '加入术语表',
    color: overwritten ? 'warning' : 'primary'
  })
  if (!confirmed) return
  applyingTerms.value = true
  try {
    const saved = await persistGlossaryTerms(terms)
    toast.add({ title: '已加入术语表', description: `${summary || `${saved} 个术语`}；后续任务生效`, color: 'success' })
  } catch (e: any) {
    toast.add({ title: '保存失败', description: e?.data?.message || e?.message || '无法更新术语表', color: 'error' })
  } finally {
    applyingTerms.value = false
  }
}

async function focusSubtitle(subtitleId: string) {
  const id = String(subtitleId || '').trim()
  if (!id) return
  const index = entries.value.findIndex(entry => String(entry.subtitleId) === id)
  if (index < 0) {
    toast.add({ title: '未找到对应字幕', description: `AI 返回的 #${id} 不在当前任务中`, color: 'warning' })
    return
  }
  resetFilters()
  focusedSubtitleId.value = id
  currentPage.value = Math.floor(index / pageSize.value) + 1
  proofreadDrawerOpen.value = false
  await nextTick()
  const target = document.getElementById(`review-entry-${id}`)
  target?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  target?.focus()
}

async function focusIssue(issue: any) {
  await focusSubtitle(String(issue?.subtitleId || ''))
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

const exportStyleItems = computed(() => getSubtitleStylePresetOptions(exportMode.value))
const exportSubtitleStyle = computed<SubtitleOutputStyle>(() => {
  if (taskSubtitleStyle.value && taskSubtitleStyle.value.presetId === exportStyle.value) return taskSubtitleStyle.value
  return createSubtitleStyle(exportStyle.value, exportMode.value)
})

function updateExportStyle(value: SubtitleOutputStyle) {
  const normalized = normalizeSubtitleStyle(value, exportMode.value)
  taskSubtitleStyle.value = normalized
  exportStyle.value = normalized.presetId
  schedulePreview()
}

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
const reasonFilterItems = computed(() => {
  const counts = reviewAnalytics.value.reasonCounts
  return [
    { label: '全部原因', value: 'all' },
    ...Array.from(counts.keys()).sort().map(reason => ({
      label: `${reasonLabel(reason)} (${counts.get(reason) || 0})`,
      value: reason
    }))
  ]
})

const proofreadIssueMap = computed(() => {
  const map = new Map<string, any[]>()
  const issues = proofreadStates.consistency.result?.issues || []
  for (const issue of issues) {
    const subtitleId = String(issue?.subtitleId || '').trim()
    if (!subtitleId) continue
    const list = map.get(subtitleId) || []
    list.push(issue)
    map.set(subtitleId, list)
  }
  return map
})

const proofreadIssueCount = computed(() => proofreadIssueMap.value.size)

const proofreadIssueTypes = computed(() => {
  const counts = new Map<string, number>()
  for (const issues of proofreadIssueMap.value.values()) {
    for (const issue of issues) {
      const type = String(issue?.type || 'other')
      counts.set(type, (counts.get(type) || 0) + 1)
    }
  }
  return Array.from(counts.entries())
    .map(([type, count]) => ({ type, count, label: proofreadIssueLabel(type) }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'zh-CN'))
})

const proofreadIssueFilterItems = computed(() => [
  { label: `全部 AI 问题 (${proofreadIssueCount.value})`, value: 'all' },
  { label: '只看有 AI 问题的字幕', value: 'any' },
  ...proofreadIssueTypes.value.map(item => ({ label: `${item.label} (${item.count})`, value: item.type }))
])

function proofreadIssueList(entry: any) {
  return proofreadIssueMap.value.get(String(entry?.subtitleId)) || []
}

function toggleProofreadIssueFilter() {
  proofreadIssueFilter.value = proofreadIssueFilter.value === 'all' ? 'any' : 'all'
}

function filterProofreadIssues(type: string | null) {
  proofreadIssueFilter.value = type || 'any'
  const desktop = typeof window !== 'undefined' && window.matchMedia('(min-width: 1280px)').matches
  if (!desktop) proofreadDrawerOpen.value = false
}

async function selectProofreadIssues() {
  const issueIds = proofreadIssueMap.value
  let count = 0
  for (const entry of entries.value) {
    const hasIssue = issueIds.has(String(entry.subtitleId))
    entry.selected = hasIssue
    if (hasIssue) count += 1
  }
  proofreadIssueFilter.value = 'any'
  lastClickedIndex.value = -1
  const desktop = typeof window !== 'undefined' && window.matchMedia('(min-width: 1280px)').matches
  if (!desktop) proofreadDrawerOpen.value = false
  if (!count) {
    toast.add({ title: '没有可选择的 AI 问题字幕', color: 'warning' })
    return
  }
  toast.add({ title: `已选中 ${count} 条问题字幕`, description: '可继续使用上方「重译选中」或手动修改。', color: 'success' })
}

async function retranslateProofreadIssues() {
  const ids = entries.value
    .filter(entry => proofreadIssueMap.value.has(String(entry.subtitleId)))
    .map(entry => String(entry.subtitleId))
  if (!ids.length) {
    toast.add({ title: '没有可重译的 AI 问题字幕', color: 'warning' })
    return
  }
  if (!(await confirmRetranslate(ids.length, 'AI 问题'))) return
  retranslating.value = true
  try {
    const idSet = new Set(ids)
    for (const entry of entries.value) {
      entry.selected = idSet.has(String(entry.subtitleId))
    }
    proofreadIssueFilter.value = 'any'
    const desktop = typeof window !== 'undefined' && window.matchMedia('(min-width: 1280px)').matches
    if (!desktop) proofreadDrawerOpen.value = false
    await saveChanges(false)
    await retranslateIds(ids)
  } catch (error: any) {
    toast.add({ title: '问题字幕重译失败', description: error?.data?.message || error?.message || '请稍后重试', color: 'error' })
  } finally {
    retranslating.value = false
  }
}

interface ReviewEntryAnalysis {
  empty: boolean
  same: boolean
  finalSame: boolean
  finalDiffers: boolean
  latinHeavy: boolean
  overlong: boolean
  needsAttention: boolean
  dirty: boolean
  selected: boolean
  reasons: Set<string>
}

interface ReviewEntryContentAnalysis {
  originalText: unknown
  translatedText: unknown
  finalText: unknown
  reviewStatus: unknown
  qualityScore: unknown
  asrConfidence: unknown
  reasonsKey: string
  qualityThreshold: number
  empty: boolean
  same: boolean
  finalSame: boolean
  finalDiffers: boolean
  latinHeavy: boolean
  overlong: boolean
  needsAttention: boolean
  reasons: Set<string>
}

const reviewContentAnalysisCache = new WeakMap<object, ReviewEntryContentAnalysis>()

function reviewReasonsKey(entry: any) {
  const reasons = Array.isArray(entry?.reviewReasons) ? entry.reviewReasons : []
  return reasons.map(String).join('\u0000')
}

function analyzeReviewEntry(entry: any, quality: number): ReviewEntryContentAnalysis {
  const reasonsKey = reviewReasonsKey(entry)
  const cached = reviewContentAnalysisCache.get(entry)
  if (
    cached
    && cached.originalText === entry.originalText
    && cached.translatedText === entry.translatedText
    && cached.finalText === entry.finalText
    && cached.reviewStatus === entry.reviewStatus
    && cached.qualityScore === entry.qualityScore
    && cached.asrConfidence === entry.asrConfidence
    && cached.reasonsKey === reasonsKey
    && cached.qualityThreshold === quality
  ) {
    return cached
  }

  const reasons = new Set<string>((Array.isArray(entry?.reviewReasons) ? entry.reviewReasons : []).map((reason: any) => String(reason)))
  const next: ReviewEntryContentAnalysis = {
    originalText: entry.originalText,
    translatedText: entry.translatedText,
    finalText: entry.finalText,
    reviewStatus: entry.reviewStatus,
    qualityScore: entry.qualityScore,
    asrConfidence: entry.asrConfidence,
    reasonsKey,
    qualityThreshold: quality,
    empty: isReviewTranslationEmpty(entry),
    same: isReviewSameAsSource(entry),
    finalSame: isReviewFinalSameAsSource(entry),
    finalDiffers: isReviewFinalDiffersFromTranslation(entry),
    latinHeavy: isReviewLatinHeavy(entry),
    overlong: isReviewOverlong(entry),
    needsAttention: isReviewNeedsAttention(entry, quality),
    reasons
  }
  reviewContentAnalysisCache.set(entry, next)
  return next
}

const reviewAnalytics = computed(() => {
  const quality = qualityThreshold.value
  const stats = {
    all: 0,
    needs_review: 0,
    translated: 0,
    accepted_same: 0,
    fallback_original: 0,
    missing: 0,
    edited: 0,
    empty: 0,
    same: 0,
    untranslated: 0,
    finalSame: 0,
    finalDiffers: 0,
    latinHeavy: 0,
    overlong: 0,
    needsAttention: 0
  }
  const byId = new Map<string, ReviewEntryAnalysis>()
  const reasonCounts = new Map<string, number>()
  const dirtyEntries: any[] = []
  const selectedEntries: any[] = []

  for (const entry of entries.value) {
    stats.all += 1
    const status = String(entry.reviewStatus || '')
    if (reviewStatuses.includes(status)) stats.needs_review += 1
    if (status === 'translated') stats.translated += 1
    if (status === 'accepted_same') stats.accepted_same += 1
    if (status === 'fallback_original') stats.fallback_original += 1
    if (status === 'missing') stats.missing += 1
    if (entry.edited) stats.edited += 1

    const content = analyzeReviewEntry(entry, quality)
    const dirty = isEntryDirty(entry)
    const selected = !!entry.selected

    if (content.empty) stats.empty += 1
    if (content.same) stats.same += 1
    if (content.empty || content.same) stats.untranslated += 1
    if (content.finalSame) stats.finalSame += 1
    if (content.finalDiffers) stats.finalDiffers += 1
    if (content.latinHeavy) stats.latinHeavy += 1
    if (content.overlong) stats.overlong += 1
    if (content.needsAttention) stats.needsAttention += 1
    for (const reason of content.reasons) reasonCounts.set(reason, (reasonCounts.get(reason) || 0) + 1)
    if (dirty) dirtyEntries.push(entry)
    if (selected) selectedEntries.push(entry)

    byId.set(String(entry.subtitleId), {
      empty: content.empty,
      same: content.same,
      finalSame: content.finalSame,
      finalDiffers: content.finalDiffers,
      latinHeavy: content.latinHeavy,
      overlong: content.overlong,
      needsAttention: content.needsAttention,
      dirty,
      selected,
      reasons: content.reasons
    })
  }

  return { stats, byId, reasonCounts, dirtyEntries, selectedEntries }
})

const filteredEntries = computed(() => {
  let list = entries.value

  if (debouncedSearchQuery.value.trim()) {
    list = list.filter(entry => matchesReviewSearch(entry, debouncedSearchQuery.value))
  }

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
    list = list.filter(entry => reviewAnalytics.value.byId.get(String(entry.subtitleId))?.dirty)
  } else if (statusFilter.value === 'selected') {
    list = list.filter(entry => reviewAnalytics.value.byId.get(String(entry.subtitleId))?.selected)
  }

  if (contentFilter.value !== 'all') {
    list = list.filter((entry) => {
      const analysis = reviewAnalytics.value.byId.get(String(entry.subtitleId))
      if (!analysis) return false
      switch (contentFilter.value) {
        case 'needs_attention': return analysis.needsAttention
        case 'untranslated': return analysis.empty || analysis.same
        case 'empty': return analysis.empty
        case 'same_as_source': return analysis.same
        case 'final_same_as_source': return analysis.finalSame
        case 'final_differs': return analysis.finalDiffers
        case 'latin_heavy': return analysis.latinHeavy
        case 'overlong': return analysis.overlong
        default: return true
      }
    })
  }

  if (proofreadIssueFilter.value !== 'all') {
    if (proofreadIssueFilter.value === 'any') {
      list = list.filter(entry => proofreadIssueMap.value.has(String(entry.subtitleId)))
    } else {
      list = list.filter(entry => proofreadIssueList(entry).some((issue: any) => String(issue.type) === proofreadIssueFilter.value))
    }
  }

  if (reasonFilter.value !== 'all') {
    list = list.filter(entry => reviewAnalytics.value.byId.get(String(entry.subtitleId))?.reasons.has(reasonFilter.value))
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

const selectedEntries = computed(() => reviewAnalytics.value.selectedEntries)
const dirtyEntries = computed(() => reviewAnalytics.value.dirtyEntries)
const dirtyCount = computed(() => dirtyEntries.value.length)

const reviewStats = computed(() => reviewAnalytics.value.stats)

const statusCounts = computed(() => ({
  all: reviewStats.value.all,
  needs_review: reviewStats.value.needs_review,
  translated: reviewStats.value.translated,
  accepted_same: reviewStats.value.accepted_same,
  fallback_original: reviewStats.value.fallback_original,
  missing: reviewStats.value.missing,
  edited: reviewStats.value.edited,
  dirty: dirtyEntries.value.length,
  selected: selectedEntries.value.length
}))

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

const contentCounts = computed(() => ({
  empty: reviewStats.value.empty,
  same: reviewStats.value.same,
  untranslated: reviewStats.value.untranslated,
  finalSame: reviewStats.value.finalSame,
  finalDiffers: reviewStats.value.finalDiffers,
  latinHeavy: reviewStats.value.latinHeavy,
  overlong: reviewStats.value.overlong,
  needsAttention: reviewStats.value.needsAttention
}))

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

const advancedFilterCount = computed(() => [
  statusFilter.value !== 'all',
  contentFilter.value !== 'all',
  reasonFilter.value !== 'all',
  confidenceFilter.value !== 'all',
  qualityFilter.value !== 'all',
  proofreadIssueFilter.value !== 'all'
].filter(Boolean).length)

const hasActiveFilters = computed(() => Boolean(
  searchQuery.value.trim()
  || advancedFilterCount.value > 0
))

const activeFilterCount = computed(() => (searchQuery.value.trim() ? 1 : 0) + advancedFilterCount.value)

function makeSnapshot(entry: any) {
  return {
    translatedText: String(entry.translatedText || ''),
    finalText: String(entry.finalText || ''),
    reviewStatus: String(entry.reviewStatus || ''),
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

function updateFinalText(entry: any, value: string) {
  entry.finalText = value
  markEdited(entry)
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

function resetAdvancedFilters() {
  statusFilter.value = 'all'
  contentFilter.value = 'all'
  reasonFilter.value = 'all'
  confidenceFilter.value = 'all'
  qualityFilter.value = 'all'
  proofreadIssueFilter.value = 'all'
  currentPage.value = 1
}

function applyFilterPreset(preset: 'needs_attention' | 'untranslated' | 'low_quality' | 'low_confidence' | 'dirty') {
  clearSearch()
  resetAdvancedFilters()

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

function toggleFilterPreset(preset: 'needs_attention' | 'untranslated' | 'low_quality' | 'low_confidence' | 'dirty') {
  const active = (preset === 'needs_attention' || preset === 'untranslated')
    ? contentFilter.value === preset
    : preset === 'low_quality'
      ? qualityFilter.value === 'low'
      : preset === 'low_confidence'
        ? confidenceFilter.value === 'low'
        : statusFilter.value === 'dirty'
  if (active) {
    if (preset === 'needs_attention' || preset === 'untranslated') contentFilter.value = 'all'
    else if (preset === 'low_quality') qualityFilter.value = 'all'
    else if (preset === 'low_confidence') confidenceFilter.value = 'all'
    else if (preset === 'dirty') statusFilter.value = 'all'
    currentPage.value = 1
    return
  }
  applyFilterPreset(preset)
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
    skipLayoutWatch = true
    bilingualLayout.value = taskMeta.bilingualLayout
    await nextTick()
    skipLayoutWatch = false
    exportMode.value = taskMeta.outputMode as any
    taskSubtitleStyle.value = res.task?.subtitleStyle || undefined
    exportStyle.value = normalizeSubtitleStylePreset(res.task?.subtitleStylePreset || res.task?.subtitleStyle?.presetId || 'bilingual_simple', exportMode.value)
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
  const desktop = typeof window !== 'undefined' && window.matchMedia('(min-width: 1280px)').matches
  if (desktop) {
    rightPanelTab.value = 'preview'
    return
  }
  previewOpen.value = true
  loadPreview()
}

function clearSearch() {
  if (searchDebounceTimer) clearTimeout(searchDebounceTimer)
  searchDebounceTimer = null
  searchQuery.value = ''
  debouncedSearchQuery.value = ''
}

function resetFilters() {
  clearSearch()
  resetAdvancedFilters()
}

async function loadPreview() {
  if (previewDebounceTimer) {
    clearTimeout(previewDebounceTimer)
    previewDebounceTimer = null
  }
  const requestId = ++previewRequestId
  previewLoading.value = true
  try {
    const res: any = await $fetch(`/api/tasks/${taskId}/review-preview`, { query: { format: previewFormat.value, bilingualLayout: bilingualLayout.value, outputMode: exportMode.value, subtitleStylePreset: exportStyle.value, subtitleStyle: JSON.stringify(exportSubtitleStyle.value) } })
    if (requestId === previewRequestId) previewContent.value = res.content || ''
  } catch (error: any) {
    if (requestId === previewRequestId) {
      toast.add({ title: '预览生成失败', description: error?.data?.message || error?.message || '请稍后重试', color: 'error' })
    }
  } finally {
    if (requestId === previewRequestId) previewLoading.value = false
  }
}

function schedulePreview() {
  if (previewDebounceTimer) clearTimeout(previewDebounceTimer)
  previewDebounceTimer = setTimeout(() => {
    previewDebounceTimer = null
    void loadPreview()
  }, 120)
}

async function saveChanges(showToast = true) {
  if (saving.value) return
  const changedEntries = dirtyEntries.value.map((entry) => ({
    subtitleId: entry.subtitleId,
    translatedText: entry.translatedText,
    finalText: entry.finalText,
    reviewStatus: entry.reviewStatus,
    sortOrder: entries.value.indexOf(entry),
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
    for (const entry of changedEntries) {
      entrySnapshots.value[String(entry.subtitleId)] = {
        translatedText: entry.translatedText,
        finalText: entry.finalText,
        reviewStatus: entry.reviewStatus,
        edited: entry.edited
      }
    }
    if (showToast) toast.add({ title: `已保存 ${changedEntries.length} 条修改`, description: '尚未生成字幕文件；需要时再点「导出结果」。', color: 'success' })
    await Promise.all([loadPreview(), refreshProofreadCacheState()])
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
  await Promise.all([loadReview(), loadPreview(), refreshProofreadCacheState()])
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
      body: { outputMode: exportMode.value, subtitleStylePreset: exportStyle.value, subtitleStyle: exportSubtitleStyle.value, subtitleFormat: exportFormat.value, bilingualLayout: bilingualLayout.value }
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

watch([searchQuery, statusFilter, contentFilter, reasonFilter, confidenceFilter, qualityFilter, proofreadIssueFilter], () => {
  currentPage.value = 1
})

watch(proofreadIssueFilterItems, (items) => {
  if (!items.some(item => item.value === proofreadIssueFilter.value)) {
    proofreadIssueFilter.value = 'all'
  }
})

watch([pageSize, totalPages], () => {
  if (currentPage.value > totalPages.value) currentPage.value = totalPages.value
  if (currentPage.value < 1) currentPage.value = 1
})

watch(previewFormat, () => {
  schedulePreview()
})

let skipLayoutWatch = false
let layoutSaveTimer: ReturnType<typeof setTimeout> | null = null
watch(bilingualLayout, (value) => {
  taskMeta.bilingualLayout = value
  if (skipLayoutWatch) return
  if (layoutSaveTimer) clearTimeout(layoutSaveTimer)
  layoutSaveTimer = setTimeout(() => {
    layoutSaveTimer = null
    void $fetch(`/api/tasks/${taskId}/review`, {
      method: 'PATCH',
      body: { entries: [], bilingualLayout: value }
    }).catch((error: any) => {
      toast.add({ title: '布局保存失败', description: error?.data?.message || error?.message || '请稍后重试', color: 'error' })
    })
  }, 300)
  schedulePreview()
})

watch(exportMode, (mode) => {
  const next = normalizeSubtitleStylePreset(exportStyle.value, mode)
  if (next !== exportStyle.value) {
    exportStyle.value = next
    taskSubtitleStyle.value = undefined
  }
  schedulePreview()
})

watch(exportStyle, () => {
  schedulePreview()
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
  if (window.matchMedia('(max-width: 767px)').matches) {
    pageSize.value = 20
  }
  window.addEventListener('beforeunload', handleBeforeUnload)
  window.addEventListener('keydown', handleShortcut)
  try {
    await loadReview()
    await Promise.all([loadPreview(), loadCachedProofread('consistency', true)])
  } catch (error: any) {
    toast.add({ title: '核对页加载失败', description: error?.data?.message || error?.message || '请返回历史页后重试', color: 'error' })
  }
})

onBeforeUnmount(() => {
  if (searchDebounceTimer) clearTimeout(searchDebounceTimer)
  if (previewDebounceTimer) clearTimeout(previewDebounceTimer)
  if (layoutSaveTimer) clearTimeout(layoutSaveTimer)
  window.removeEventListener('beforeunload', handleBeforeUnload)
  window.removeEventListener('keydown', handleShortcut)
})
</script>
