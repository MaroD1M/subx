<template>
  <AppContainer size="narrow" class="space-y-6 py-2">
    <PageHeader
      :title="task.step === 'done' ? '翻译任务完成' : task.step === 'cancelled' ? '翻译任务已取消' : task.step === 'error' ? '翻译任务失败' : task.step === 'review' ? '字幕待核对' : '翻译任务进行中'"
      :description="`任务 ID: ${$route.params.id}`"
      :breadcrumb="[{ label: '翻译历史', icon: 'i-lucide-history', to: '/history' }, { label: '任务详情' }]"
    >
      <p v-if="task.filePath" class="text-xs text-gray-500 break-all dark:text-gray-400">{{ task.rootName || '默认媒体库' }} · {{ task.filePath }}</p>
      <p v-if="task.contentTitle" class="text-xs text-primary-700 break-all">作品：{{ task.contentTitle }}</p>
      <template #actions>
        <AppStatusBadge :status="statusBadgeStatus" :label="statusBadgeLabel" />
        <UButton label="返回历史" icon="i-lucide-arrow-left" variant="soft" color="neutral" to="/history" />
      </template>
    </PageHeader>

    <div class="app-section space-y-5">
      <section class="space-y-4" aria-label="任务进度">
        <div class="flex flex-wrap items-start justify-between gap-4">
            <div class="min-w-0 space-y-1.5">
              <p class="app-meta font-medium">当前阶段</p>
              <h3 class="flex items-center gap-2 text-lg font-bold text-gray-900 dark:text-white" aria-live="polite">
                <UIcon :name="stepIcon" class="h-5 w-5 shrink-0" :class="task.step === 'done' ? 'text-emerald-500' : task.step === 'error' ? 'text-red-500' : 'animate-pulse text-primary-700'" />
                <span>{{ statusLabel }}</span>
              </h3>
              <p v-if="task.stepMessage" class="app-caption line-clamp-2">{{ task.stepMessage }}</p>
            </div>
            <div class="text-right">
              <p class="app-meta font-medium">总进度</p>
              <p class="text-3xl font-black tracking-tighter text-gray-900 dark:text-white">{{ task.step === 'done' ? 100 : task.progress }}%</p>
            </div>
          </div>
          <UProgress :model-value="task.step === 'done' ? 100 : task.progress" aria-label="任务进度" size="xl" :color="task.step === 'error' || task.step === 'cancelled' ? 'error' : task.step === 'done' ? 'success' : 'primary'" class="h-3 rounded-full overflow-hidden" />

          <div v-if="showStepProgress" class="space-y-1.5">
            <div class="flex items-center justify-between gap-3">
              <span class="app-meta truncate">当前阶段进度</span>
              <span class="app-meta shrink-0 font-medium">{{ stepProgressValue }}%</span>
            </div>
            <UProgress :model-value="stepProgressValue" aria-label="当前阶段进度" size="sm" :color="task.step === 'error' || task.step === 'cancelled' ? 'error' : 'primary'" />
          </div>

          <TaskTimingCard :task="task" :time-zone="timeZone" />
      </section>

        <div v-if="(task.step === 'error' || task.step === 'cancelled') && task.error" class="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-4 rounded-2xl flex items-start gap-3">
          <UIcon name="i-lucide-alert-circle" class="w-5 h-5 text-red-500 mt-0.5" />
          <div class="space-y-1">
            <p class="text-sm font-bold text-red-800 dark:text-red-200">{{ task.step === 'cancelled' ? '任务已取消' : '处理出错' }}</p>
            <p class="text-xs text-red-700 dark:text-red-300 leading-relaxed">{{ task.error }}</p>
          </div>
        </div>

        <div v-if="task.step === 'error' && failureSummary" class="rounded-2xl border border-amber-200 dark:border-amber-800 bg-amber-50/90 dark:bg-amber-900/20 p-4 space-y-3">
          <div class="flex items-start gap-3">
            <UIcon :name="failureSummary.icon" class="w-5 h-5 text-amber-500 mt-0.5" />
            <div class="min-w-0 space-y-1">
              <p class="text-sm font-bold text-amber-900 dark:text-amber-200">{{ failureSummary.title }}</p>
              <p class="text-xs text-amber-800 dark:text-amber-300 leading-relaxed">{{ failureSummary.summary }}</p>
            </div>
          </div>
          <div class="grid gap-2 sm:grid-cols-3">
            <div class="rounded-xl bg-white/70 px-3 py-2 dark:bg-black/10">
              <p class="app-meta font-semibold uppercase tracking-wider text-amber-600 dark:text-amber-400">失败类型</p>
              <p class="mt-1 text-sm font-medium text-amber-900 dark:text-amber-100">{{ failureSummary.typeLabel }}</p>
            </div>
            <div class="rounded-xl bg-white/70 px-3 py-2 dark:bg-black/10 sm:col-span-2">
              <p class="app-meta font-semibold uppercase tracking-wider text-amber-600 dark:text-amber-400">关键细节</p>
              <p class="mt-1 break-words text-sm font-medium text-amber-900 dark:text-amber-100">{{ failureSummary.detail }}</p>
            </div>
          </div>
        </div>

        <section class="space-y-3" aria-label="任务概览">
          <div class="flex flex-wrap items-end justify-between gap-2">
            <div>
              <p class="app-section-title">任务概览</p>
              <p class="app-caption">输出、来源、语言与模型等关键信息。</p>
            </div>
          </div>
          <div class="app-stat-grid">
            <div class="app-stat sm:col-span-2">
              <p class="app-meta font-medium">输出</p>
              <p class="mt-1 break-words text-sm font-medium text-gray-800 dark:text-gray-100">{{ taskOutputSummary }}</p>
            </div>
            <div class="app-stat">
              <p class="app-meta font-medium">字幕来源</p>
              <p class="mt-1 break-words text-sm font-medium text-gray-800 dark:text-gray-100">{{ sourceTypeLabel }}</p>
            </div>
            <div class="app-stat">
              <p class="app-meta font-medium">目标语言</p>
              <p class="mt-1 break-words text-sm font-medium text-gray-800 dark:text-gray-100">{{ task.targetLanguage === 'zh-CN' ? '简体中文' : (task.targetLanguage || '自动') }}</p>
            </div>
            <div class="app-stat sm:col-span-2">
              <p class="app-meta font-medium">翻译模型</p>
              <p class="mt-1 break-all text-sm font-medium text-gray-800 dark:text-gray-100" :title="modelDisplayText">{{ modelDisplayText }}</p>
            </div>
            <div class="app-stat">
              <p class="app-meta font-medium">媒体库</p>
              <p class="mt-1 truncate text-sm font-medium text-gray-800 dark:text-gray-100" :title="task.rootName || '默认媒体库'">{{ task.rootName || '默认媒体库' }}</p>
            </div>
            <div class="app-stat">
              <p class="app-meta font-medium">{{ showRecognitionProgress ? '识别进度' : '分块进度' }}</p>
              <p v-if="showRecognitionProgress" class="mt-1 break-words text-sm font-medium text-gray-800 dark:text-gray-100">{{ task.stepMessage || '等待识别完成后分块' }}</p>
              <p v-else-if="task.step === 'done'" class="mt-1 text-sm font-medium text-gray-800 dark:text-gray-100">已完成</p>
              <p v-else class="mt-1 text-sm font-medium text-gray-800 dark:text-gray-100">{{ task.completedChunks || 0 }} / {{ task.totalChunks || '-' }}</p>
            </div>
            <template v-if="['asr', 'ocr'].includes(task.sourceType)">
              <div class="app-stat">
                <p class="app-meta font-medium">源语言</p>
                <p class="mt-1 break-words text-sm font-medium text-gray-800 dark:text-gray-100">{{ task.sourceLanguage || (isSourceRecognitionStage ? '待识别' : '自动检测') }}</p>
              </div>
              <div class="app-stat">
                <p class="app-meta font-medium">ASR 置信度</p>
                <p class="mt-1 text-sm font-medium text-gray-800 dark:text-gray-100">{{ task.asrConfidence != null ? `${(Number(task.asrConfidence) * 100).toFixed(1)}%` : (isSourceRecognitionStage ? '识别完成后显示' : '-') }}</p>
              </div>
            </template>
          </div>
        </section>

        <div class="flex flex-wrap items-center gap-1 rounded-xl border border-gray-200/70 bg-gray-50/70 p-1 dark:border-gray-800 dark:bg-gray-900/40" role="tablist" aria-label="任务详情">
          <button
            v-for="tab in tabs"
            :key="tab.value"
            type="button"
            role="tab"
            :aria-selected="activeTab === tab.value"
            class="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors sm:text-sm"
            :class="activeTab === tab.value ? 'bg-white text-primary-700 shadow-sm dark:bg-gray-950 dark:text-primary-400' : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'"
            @click="activeTab = tab.value"
          >
            {{ tab.label }}
            <span v-if="tab.value === 'logs' && logs.length" class="app-pill app-pill-neutral px-1.5 text-xs font-semibold">{{ logs.length }}</span>
            <span v-else-if="tab.value === 'diagnostics' && reviewDiagnosticsIssues.length" class="app-pill app-pill-warning px-1.5 text-xs font-semibold">{{ reviewDiagnosticsIssues.length }}</span>
          </button>
        </div>

        <div v-show="activeTab === 'overview'" class="space-y-3" role="tabpanel">
          <div>
            <p class="app-section-title">任务信息</p>
            <p class="app-caption">关键结果与进度已在上方概览展示，这里补充任务文件与内容说明。</p>
          </div>
          <div class="app-stat-grid sm:grid-cols-2 xl:grid-cols-4">
            <div class="app-stat">
              <p class="app-meta font-medium">任务文件</p>
              <p class="mt-1 break-all text-sm font-medium text-gray-800 dark:text-gray-100">{{ task.filePath || '—' }}</p>
            </div>
            <div class="app-stat">
              <p class="app-meta font-medium">作品</p>
              <p class="mt-1 break-words text-sm font-medium text-gray-800 dark:text-gray-100">{{ task.contentTitle || '—' }}</p>
            </div>
            <div class="app-stat">
              <p class="app-meta font-medium">创建时间</p>
              <p class="mt-1 text-sm font-medium text-gray-800 dark:text-gray-100">{{ task.createdAt ? formatDateTime(task.createdAt, timeZone) : '—' }}</p>
            </div>
            <div class="app-stat">
              <p class="app-meta font-medium">更新时间</p>
              <p class="mt-1 text-sm font-medium text-gray-800 dark:text-gray-100">{{ task.updatedAt ? formatDateTime(task.updatedAt, timeZone) : '—' }}</p>
            </div>
          </div>
          <div v-if="task.contentBackground" class="space-y-1">
            <p class="app-meta font-medium">内容背景</p>
            <p class="whitespace-pre-wrap break-words text-sm leading-6 text-gray-700 dark:text-gray-300">{{ task.contentBackground }}</p>
          </div>
          <div v-if="task.customInstructions" class="space-y-1">
            <p class="app-meta font-medium">自定义要求</p>
            <p class="whitespace-pre-wrap break-words text-sm leading-6 text-gray-700 dark:text-gray-300">{{ task.customInstructions }}</p>
          </div>
        </div>

        <TaskLogsPanel
          v-show="activeTab === 'logs'"
          :logs="logs"
          :current-text="task.currentText"
          :current-text-timestamp="currentTextTimestamp"
        />
        <div v-show="activeTab === 'asr'" class="space-y-4" role="tabpanel">
          <div v-if="asrLoading && !asrRun && !asrPartial" class="surface-card flex items-center gap-2 p-4 text-sm text-gray-500 dark:text-gray-400">
            <UIcon name="i-lucide-loader-2" class="h-4 w-4 animate-spin" />
            正在加载 ASR 识别结果...
          </div>
          <template v-else-if="asrRun || asrPartial">
            <div v-if="asrPartial && !asrRun" class="rounded-2xl border border-primary-100 bg-primary-50/60 p-4 dark:border-primary-900/40 dark:bg-primary-950/20">
              <div class="flex items-start gap-3">
                <UIcon :name="asrPartial.active ? 'i-lucide-loader-2' : 'i-lucide-database'" class="mt-0.5 h-5 w-5 shrink-0" :class="asrPartial.active ? 'animate-spin text-primary-600 dark:text-primary-400' : 'text-gray-500'" />
                <div class="min-w-0 space-y-1">
                  <p class="text-sm font-semibold text-primary-900 dark:text-primary-100">{{ asrPartialStatusText }}</p>
                  <p class="text-xs leading-5 text-primary-800 dark:text-primary-200">
                    已完成 {{ asrPartial.doneChunks || 0 }} 个分段，已识别 {{ asrPartial.totalSegments || asrSegments.length }} 条。
                    <span v-if="asrPartial.updatedAt">最后更新 {{ formatDateTime(asrPartial.updatedAt, timeZone) }}。</span>
                  </p>
                  <p v-if="asrPartial.active" class="text-xs leading-5 text-primary-800 dark:text-primary-200">已识别内容会随分段完成持续追加；当前分段内部进度请查看上方任务进度。</p>
                </div>
              </div>
            </div>

            <div v-if="asrRun" class="app-stat-grid">
              <div class="app-stat">
                <p class="app-meta font-medium">引擎 / 模型</p>
                <p class="mt-1 text-sm font-medium text-gray-800 dark:text-gray-100">{{ asrRun.engine }} · {{ asrRun.model }}</p>
              </div>
              <div class="app-stat">
                <p class="app-meta font-medium">源语言</p>
                <p class="mt-1 text-sm font-medium text-gray-800 dark:text-gray-100">{{ asrRun.language }}</p>
              </div>
              <div class="app-stat">
                <p class="app-meta font-medium">平均置信度</p>
                <p class="mt-1 text-sm font-medium" :class="Number(asrRun.confidence) < 0.6 ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'">
                  {{ (Number(asrRun.confidence || 0) * 100).toFixed(1) }}%
                </p>
              </div>
              <div class="app-stat">
                <p class="app-meta font-medium">RTF</p>
                <p class="mt-1 text-sm font-medium text-gray-800 dark:text-gray-100">{{ Number(asrRun.rtf || 0).toFixed(3) }}</p>
              </div>
            </div>

            <div v-else class="app-stat-grid">
              <div class="app-stat">
                <p class="app-meta font-medium">识别状态</p>
                <p class="mt-1 text-sm font-medium text-gray-800 dark:text-gray-100">{{ asrPartialStatusText }}</p>
              </div>
              <div class="app-stat">
                <p class="app-meta font-medium">已完成分段</p>
                <p class="mt-1 text-sm font-medium text-gray-800 dark:text-gray-100">{{ asrPartial?.doneChunks || 0 }}</p>
              </div>
              <div class="app-stat">
                <p class="app-meta font-medium">已识别片段</p>
                <p class="mt-1 text-sm font-medium text-gray-800 dark:text-gray-100">{{ asrPartial?.totalSegments || asrSegments.length }} 条</p>
              </div>
              <div class="app-stat">
                <p class="app-meta font-medium">最后更新</p>
                <p class="mt-1 text-sm font-medium text-gray-800 dark:text-gray-100">{{ asrPartial?.updatedAt ? formatDateTime(asrPartial.updatedAt, timeZone) : '-' }}</p>
              </div>
            </div>

            <div class="surface-card p-4">
              <div class="mb-3 flex items-center justify-between gap-3">
                <div class="min-w-0">
                  <p class="app-section-title">{{ asrRun ? '识别分段' : '实时识别结果' }}</p>
                  <p class="app-caption">{{ asrRun ? '最多展示前 500 条，低置信度会标黄。' : '识别中会随已完成分段追加，最多展示前 500 条。' }}</p>
                </div>
                <UBadge color="neutral" variant="subtle" class="shrink-0">{{ asrSegments.length }} 条</UBadge>
              </div>
              <div v-if="!asrSegments.length" class="surface-card border-dashed px-3 py-8 text-center text-sm text-gray-500 dark:text-gray-400">
                等待第一个识别分段完成...
              </div>
              <div v-else class="max-h-[50vh] space-y-2 overflow-y-auto pr-1 custom-scrollbar">
                <div v-for="segment in asrSegments" :key="segment.id" class="rounded-xl border px-3 py-2" :class="Number(segment.confidence) < 0.6 ? 'border-amber-200 bg-amber-50/70 dark:border-amber-900/40 dark:bg-amber-950/15' : 'border-gray-100 bg-gray-50/60 dark:border-gray-800 dark:bg-gray-900/30'">
                  <div class="mb-1 flex flex-wrap items-center justify-between gap-2 text-xs text-gray-500 dark:text-gray-400">
                    <span>{{ (Number(segment.startMs) / 1000).toFixed(2) }}s → {{ (Number(segment.endMs) / 1000).toFixed(2) }}s</span>
                    <div class="flex items-center gap-1.5">
                      <UBadge v-if="segment.speaker" color="primary" variant="subtle" size="sm">{{ segment.speaker }}</UBadge>
                      <span>置信度 {{ (Number(segment.confidence || 0) * 100).toFixed(0) }}%</span>
                    </div>
                  </div>
                  <p class="text-sm leading-6 text-gray-800 dark:text-gray-100 whitespace-pre-wrap break-words">{{ segment.text }}</p>
                </div>
              </div>
            </div>
          </template>
          <div v-else class="surface-card p-4 text-sm text-gray-500 dark:text-gray-400">
            {{ ['extracting_audio', 'transcribing', 'paused'].includes(String(task.step || '')) ? '正在等待第一个 ASR 识别分段完成...' : '暂无 ASR 识别结果。' }}
          </div>
        </div>

        <div v-show="activeTab === 'diagnostics'" class="space-y-4" role="tabpanel">
        <div v-if="qualityRun" class="surface-card p-4">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <div class="min-w-0">
              <p class="app-section-title">双模型质量校验</p>
              <p class="app-meta">{{ qualityRun.model }} · 已校验 {{ qualityRun.entriesChecked }} 条 · {{ qualityRun.status }}</p>
            </div>
            <UBadge :color="qualityRun.avgScore < qualityThreshold ? 'warning' : 'success'" variant="subtle">平均 {{ (Number(qualityRun.avgScore) * 100).toFixed(1) }}%</UBadge>
          </div>
          <div class="mt-3 flex flex-wrap gap-1.5">
            <UBadge v-for="(count, issue) in qualityRun.issueSummary" :key="issue" color="error" variant="subtle" size="sm">{{ issue }} × {{ count }}</UBadge>
            <span v-if="!Object.keys(qualityRun.issueSummary || {}).length" class="app-caption">未发现明确质量问题</span>
          </div>
          <p v-if="qualityRun.error" class="mt-2 text-xs text-red-600 dark:text-red-400">{{ qualityRun.error }}</p>
        </div>
        <details v-if="showDiagnosticsSection" class="surface-card p-4">
          <summary class="cursor-pointer list-none flex items-center justify-between gap-3">
            <div>
              <p class="app-section-title">诊断信息</p>
              <p class="app-caption mt-1">连接状态、翻译模式与用量统计默认折叠显示。</p>
            </div>
            <UIcon name="i-lucide-chevron-down" class="w-4 h-4 text-gray-400" />
          </summary>

          <div class="mt-4 space-y-4">
            <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div class="surface-muted p-3">
                <p class="app-meta font-medium">翻译模式</p>
                <p class="mt-1 text-sm font-medium text-gray-700 dark:text-gray-300">{{ translationModeLabel }}</p>
              </div>
              <div class="surface-muted p-3">
                <p class="app-meta font-medium">连接状态</p>
                <p class="mt-1 text-sm font-medium text-gray-700 dark:text-gray-300">{{ connectionBanner?.title || '无' }}</p>
              </div>
            </div>

            <div v-if="connectionBanner" class="rounded-2xl border p-4 flex items-start gap-3" :class="connectionBannerClass">
              <UIcon :name="connectionBanner.icon" class="w-5 h-5 mt-0.5 shrink-0" :class="connectionBanner.iconClass" />
              <div class="space-y-1">
                <p class="text-sm font-bold" :class="connectionBanner.titleClass">{{ connectionBanner.title }}</p>
                <p class="text-xs leading-relaxed" :class="connectionBanner.textClass">{{ connectionBanner.message }}</p>
              </div>
            </div>

            <div v-if="reviewDiagnosticsIssues.length" class="rounded-2xl border border-amber-200 dark:border-amber-800 bg-amber-50/80 dark:bg-amber-900/20 p-4 space-y-3">
              <div class="flex items-start gap-3">
                <UIcon name="i-lucide-badge-alert" class="w-5 h-5 text-amber-500 mt-0.5 shrink-0" />
                <div class="space-y-1 min-w-0">
                  <p class="text-sm font-bold text-amber-900 dark:text-amber-200">字幕异常诊断</p>
                  <p class="text-xs text-amber-800 dark:text-amber-300 leading-relaxed">已聚合当前任务进入核对阶段的异常类型与受影响字幕 ID，便于快速定位问题块。</p>
                </div>
              </div>

              <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                <div v-for="issue in reviewDiagnosticsIssues" :key="issue.reason" class="rounded-xl bg-white/80 dark:bg-black/10 px-3 py-3 space-y-2 border border-amber-100 dark:border-amber-900/30">
                  <div class="flex items-center justify-between gap-2">
                    <p class="text-xs font-semibold text-amber-900 dark:text-amber-100">{{ reviewReasonLabel(issue.reason) }}</p>
                    <UBadge color="warning" variant="subtle" size="sm">{{ issue.count }} 条</UBadge>
                  </div>
                  <div v-if="issue.subtitleIds.length" class="flex flex-wrap gap-1.5">
                    <UButton
                      v-for="subtitleId in issue.subtitleIds"
                      :key="subtitleId"
                      :label="`#${subtitleId}`"
                      size="xs"
                      color="warning"
                      variant="ghost"
                      class="px-1.5"
                      @click="openReviewPage(subtitleId)"
                    />
                  </div>
                  <p v-else class="app-meta text-amber-700 dark:text-amber-300">暂无 ID</p>
                </div>
              </div>
            </div>

            <div v-if="task.step === 'done'" class="space-y-3">
              <div class="flex items-center justify-between">
                <UButton :label="showResponses ? '隐藏用量统计' : '查看用量统计'" icon="i-lucide-chart-column-big" color="neutral" variant="ghost" @click="showResponses = !showResponses" />
              </div>

              <div v-if="showResponses" class="rounded-2xl bg-gray-950 text-gray-100 p-4 ring-1 ring-white/10 space-y-4">
                <div v-if="responsesLoading" class="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                  <UIcon name="i-lucide-loader-2" class="w-4 h-4 animate-spin" /> 加载用量统计...
                </div>
                <div v-else-if="responsesSummary" class="space-y-4">
                  <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div class="space-y-1"><span class="app-meta uppercase font-bold text-gray-500">分块数</span><p class="text-sm font-medium text-gray-100">{{ responsesSummary.totalChunks }}</p></div>
                    <div class="space-y-1"><span class="app-meta uppercase font-bold text-gray-500">输入令牌</span><p class="text-sm font-medium text-amber-400">{{ responsesSummary.totalPromptTokens.toLocaleString() }}</p></div>
                    <div class="space-y-1"><span class="app-meta uppercase font-bold text-gray-500">输出令牌</span><p class="text-sm font-medium text-emerald-400">{{ responsesSummary.totalCompletionTokens.toLocaleString() }}</p></div>
                    <div class="space-y-1"><span class="app-meta uppercase font-bold text-gray-500">总令牌</span><p class="text-sm font-medium text-primary-400">{{ responsesSummary.totalTokens.toLocaleString() }}</p></div>
                  </div>
                  <div v-if="responseDiagnosticsSummary" class="rounded-2xl border border-amber-200/70 bg-amber-50/70 dark:border-amber-800/60 dark:bg-amber-900/15 p-4 space-y-3">
                    <div class="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                      <div class="space-y-1">
                        <p class="text-sm font-semibold text-amber-900 dark:text-amber-100">翻译返回诊断摘要</p>
                        <p class="text-xs text-amber-700 dark:text-amber-300 leading-relaxed">仅展示概况统计；完整请求与返回保留在下方折叠区，便于排查且不影响页面排版。</p>
                        <p class="app-meta text-amber-800 dark:text-amber-200">{{ responseDiagnosticsSummary.overviewText }}</p>
                      </div>
                      <UBadge color="warning" variant="subtle">{{ responseDiagnosticsSummary.totalIssues }} 个异常块</UBadge>
                    </div>
                    <div class="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
                      <div class="rounded-xl bg-white/70 dark:bg-black/10 px-3 py-2">
                        <p class="app-meta font-semibold uppercase tracking-wider text-amber-600 dark:text-amber-400">结构化返回</p>
                        <p class="mt-1 text-sm font-semibold text-amber-950 dark:text-amber-100">{{ responseDiagnosticsSummary.structuredChunks }}</p>
                      </div>
                      <div class="rounded-xl bg-white/70 dark:bg-black/10 px-3 py-2">
                        <p class="app-meta font-semibold uppercase tracking-wider text-amber-600 dark:text-amber-400">纯文本返回</p>
                        <p class="mt-1 text-sm font-semibold text-amber-950 dark:text-amber-100">{{ responseDiagnosticsSummary.plainChunks }}</p>
                      </div>
                      <div class="rounded-xl bg-white/70 dark:bg-black/10 px-3 py-2">
                        <p class="app-meta font-semibold uppercase tracking-wider text-amber-600 dark:text-amber-400">空响应/异常</p>
                        <p class="mt-1 text-sm font-semibold text-amber-950 dark:text-amber-100">{{ responseDiagnosticsSummary.emptyChunks }}</p>
                      </div>
                      <div class="rounded-xl bg-white/70 dark:bg-black/10 px-3 py-2">
                        <p class="app-meta font-semibold uppercase tracking-wider text-amber-600 dark:text-amber-400">拒答/过滤</p>
                        <p class="mt-1 text-sm font-semibold text-amber-950 dark:text-amber-100">{{ responseDiagnosticsSummary.refusalChunks + responseDiagnosticsSummary.filteredChunks }}</p>
                      </div>
                      <div class="rounded-xl bg-white/70 dark:bg-black/10 px-3 py-2">
                        <p class="app-meta font-semibold uppercase tracking-wider text-amber-600 dark:text-amber-400">缺条块数</p>
                        <p class="mt-1 text-sm font-semibold text-amber-950 dark:text-amber-100">{{ responseDiagnosticsSummary.missingIdChunks }}</p>
                      </div>
                      <div class="rounded-xl bg-white/70 dark:bg-black/10 px-3 py-2">
                        <p class="app-meta font-semibold uppercase tracking-wider text-amber-600 dark:text-amber-400">解析丢失块数</p>
                        <p class="mt-1 text-sm font-semibold text-amber-950 dark:text-amber-100">{{ responseDiagnosticsSummary.chunksWithParseLoss }}</p>
                      </div>
                      <div class="rounded-xl bg-white/70 dark:bg-black/10 px-3 py-2">
                        <p class="app-meta font-semibold uppercase tracking-wider text-amber-600 dark:text-amber-400">重试块数</p>
                        <p class="mt-1 text-sm font-semibold text-amber-950 dark:text-amber-100">{{ responseDiagnosticsSummary.retriedChunks }}</p>
                      </div>
                      <div class="rounded-xl bg-white/70 dark:bg-black/10 px-3 py-2">
                        <p class="app-meta font-semibold uppercase tracking-wider text-amber-600 dark:text-amber-400">单条补译块数</p>
                        <p class="mt-1 text-sm font-semibold text-amber-950 dark:text-amber-100">{{ responseDiagnosticsSummary.singleRetriedChunks }}</p>
                      </div>
                      <div class="rounded-xl bg-white/70 dark:bg-black/10 px-3 py-2">
                        <p class="app-meta font-semibold uppercase tracking-wider text-amber-600 dark:text-amber-400">回退原文块数</p>
                        <p class="mt-1 text-sm font-semibold text-amber-950 dark:text-amber-100">{{ responseDiagnosticsSummary.fallbackChunks }}</p>
                      </div>
                    </div>
                    <div v-if="responseDiagnosticsSummary.issues.length" class="flex flex-wrap gap-2">
                      <UBadge v-for="issue in responseDiagnosticsSummary.issues" :key="issue.issue" color="warning" variant="soft">{{ issue.label }} × {{ issue.count }}</UBadge>
                    </div>
                    <div v-if="responseDiagnosticsSummary.riskTags?.length" class="space-y-2">
                      <p class="app-meta text-amber-700 dark:text-amber-300">高风险标签分布</p>
                      <div class="flex flex-wrap gap-2">
                        <UBadge v-for="risk in responseDiagnosticsSummary.riskTags" :key="risk.tag" color="primary" variant="subtle">{{ riskTagLabel(risk.tag) }} × {{ risk.count }}</UBadge>
                      </div>
                    </div>
                  </div>
                  <div class="space-y-3">
                    <div class="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                      <UIcon name="i-lucide-messages-square" class="w-4 h-4" /> AI 返回预览（默认截断，便于快速排查）
                    </div>
                    <div class="space-y-3 max-h-80 overflow-y-auto custom-scrollbar pr-1">
                      <details v-for="r in responsesRecords" :key="`preview-${r.id}`" class="rounded-xl border border-gray-800/70 bg-black/20 px-3 py-3">
                        <summary class="cursor-pointer list-none flex items-center justify-between gap-3">
                          <div class="min-w-0">
                            <p class="text-xs font-semibold text-gray-200">块 #{{ (r.chunk_index || 0) + 1 }} · {{ r.model || '未知模型' }}</p>
                            <div class="mt-1 flex flex-wrap gap-1.5">
                              <UBadge size="xs" color="neutral" variant="subtle">{{ r.response_meta?.format || '未知格式' }}</UBadge>
                              <UBadge size="xs" :color="r.response_issue === 'empty' || r.response_issue === 'refusal' || r.response_issue === 'filtered' ? 'warning' : 'primary'" variant="subtle">{{ r.response_issue_label }}</UBadge>
                              <UBadge v-if="r.response_meta && Number(r.response_meta.expectedCount || 0) > 0" size="xs" color="neutral" variant="subtle">解析 {{ r.response_meta.parsedCount }}/{{ r.response_meta.expectedCount }}</UBadge>
                              <UBadge v-if="r.response_meta?.missingIds?.length" size="xs" color="warning" variant="soft">缺失 ID: {{ r.response_meta.missingIds.slice(0, 4).join(', ') }}{{ r.response_meta.missingIds.length > 4 ? '…' : '' }}</UBadge>
                              <UBadge v-if="r.response_meta?.chunkDiagnostics?.retryAttempts" size="xs" color="primary" variant="subtle">重试 {{ r.response_meta.chunkDiagnostics.retryAttempts }} 次</UBadge>
                              <UBadge v-if="r.response_meta?.chunkDiagnostics?.singleRetryAttempts" size="xs" color="warning" variant="subtle">单条补译 {{ r.response_meta.chunkDiagnostics.singleRetryAttempts }} 条</UBadge>
                              <UBadge v-if="r.response_meta?.chunkDiagnostics?.fallbackCount" size="xs" color="error" variant="soft">回退原文 {{ r.response_meta.chunkDiagnostics.fallbackCount }} 条</UBadge>
                              <UBadge v-for="tag in (r.response_meta?.chunkRisk?.tags || []).slice(0, 4)" :key="`${r.id}-${tag}`" size="xs" color="primary" variant="subtle">{{ riskTagLabel(tag) }}</UBadge>
                            </div>
                            <p class="mt-2 text-xs text-gray-500 dark:text-gray-400 line-clamp-2 break-words">{{ r.raw_response_preview || '暂无返回内容' }}</p>
                          </div>
                          <UIcon name="i-lucide-chevron-down" class="w-4 h-4 text-gray-500 shrink-0" />
                        </summary>
                        <div class="mt-3 grid gap-3 lg:grid-cols-2">
                          <div class="space-y-1 min-w-0">
                            <p class="app-meta uppercase tracking-widest text-gray-500">请求内容</p>
                            <pre class="text-xs leading-5 whitespace-pre-wrap break-words text-gray-500 dark:text-gray-400 max-h-48 overflow-y-auto custom-scrollbar">{{ r.raw_request || '暂无请求内容' }}</pre>
                          </div>
                          <div class="space-y-1 min-w-0">
                            <p class="app-meta uppercase tracking-widest text-gray-500">返回内容</p>
                            <pre class="text-xs leading-5 whitespace-pre-wrap break-words text-gray-200 max-h-48 overflow-y-auto custom-scrollbar">{{ r.raw_response || '暂无返回内容' }}</pre>
                          </div>
                        </div>
                      </details>
                    </div>
                  </div>
                  <div class="max-h-48 overflow-y-auto custom-scrollbar">
                    <table class="w-full text-left">
                      <thead>
                        <tr class="text-gray-500 text-xs uppercase"><th class="pb-2 pr-4">块</th><th class="pb-2 pr-4">模型</th><th class="pb-2 pr-4">输入令牌</th><th class="pb-2 pr-4">输出令牌</th><th class="pb-2">总计令牌</th></tr>
                      </thead>
                      <tbody class="text-gray-600 dark:text-gray-300">
                        <tr v-for="r in responsesRecords" :key="r.id" class="border-t border-gray-800/50">
                          <td class="py-1.5 pr-4 text-gray-500">#{{ r.chunk_index + 1 }}</td>
                          <td class="py-1.5 pr-4 text-gray-300">{{ r.model }}</td>
                          <td class="py-1.5 pr-4 text-amber-400">{{ (r.prompt_tokens || 0).toLocaleString() }}</td>
                          <td class="py-1.5 pr-4 text-emerald-400">{{ (r.completion_tokens || 0).toLocaleString() }}</td>
                          <td class="py-1.5 text-primary-400">{{ (r.total_tokens || 0).toLocaleString() }}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
                <div v-else class="text-xs text-gray-500 dark:text-gray-400">暂无可用统计。</div>
              </div>
            </div>
          </div>
        </details>
        </div>

        <div class="flex flex-wrap items-center gap-2 border-t border-gray-200/70 pt-4 dark:border-gray-800">
          <UButton v-if="task.step === 'done'" label="下载结果" icon="i-lucide-download" color="primary" @click="downloadSrt" />
          <UButton v-if="task.step === 'done'" label="下载原始" icon="i-lucide-file-text" color="neutral" variant="ghost" @click="downloadOriginal" />
          <UButton v-if="task.step === 'review'" label="进入核对" icon="i-lucide-list-checks" color="warning" @click="openReviewPage()" />
          <UButton v-if="task.step === 'done'" label="返回首页" icon="i-lucide-check-circle" color="primary" to="/" />
          <UButton v-if="task.step === 'done'" label="返回历史" icon="i-lucide-history" color="neutral" variant="ghost" to="/history" />
          <UButton v-else-if="task.step === 'error' || task.step === 'cancelled'" label="返回历史" icon="i-lucide-history" color="neutral" to="/history" />
          <template v-else>
            <UButton v-if="task.step === 'paused' && !task.pauseRequested" label="继续任务" icon="i-lucide-play" color="primary" :loading="resuming" @click="resumeTask" />
            <UButton v-else-if="pausePending" label="暂停中…" icon="i-lucide-loader-2" color="warning" variant="soft" loading disabled />
            <UButton v-else-if="canPauseTask" label="暂停任务" icon="i-lucide-pause" color="warning" variant="soft" :loading="pausing" @click="pauseTask" />
            <UButton label="取消任务" icon="i-lucide-octagon-x" color="error" variant="soft" :loading="cancelling" @click="cancelTask" />
          </template>
        </div>
    </div>
  </AppContainer>
</template>

<script setup lang="ts">
definePageMeta({ key: route => String(route.params.id || '') })
import { formatClock as formatClockInZone, formatDateTime } from '~~/shared/time'
import { reviewReasonLabel } from '~~/shared/reviewLabels'
import TaskTimingCard from '~/components/TaskTimingCard.vue'

const route = useRoute()
const timeZone = useTimeZone()

const activeTab = ref<'overview' | 'logs' | 'diagnostics' | 'asr'>('overview')
const tabs = computed<Array<{ label: string, value: 'overview' | 'logs' | 'diagnostics' | 'asr' }>>(() => {
  const list: Array<{ label: string, value: 'overview' | 'logs' | 'diagnostics' | 'asr' }> = [
    { label: '概览', value: 'overview' as const },
    { label: '日志', value: 'logs' as const },
    { label: '诊断', value: 'diagnostics' as const }
  ]
  if (['asr', 'ocr'].includes(task.value.sourceType) || ['extracting_audio', 'transcribing'].includes(String(task.value.step || ''))) {
    list.push({ label: task.value.sourceType === 'ocr' ? 'OCR 详情' : '语音识别', value: 'asr' as const })
  }
  return list
})
const asrLoading = ref(false)
const asrRun = ref<any>(null)
const asrPartial = ref<any>(null)
const asrSegments = ref<any[]>([])
let asrPollTimer: ReturnType<typeof setInterval> | null = null
const qualityRun = ref<any>(null)
const qualityThreshold = ref(0.7)

const task = ref<any>({
  step: 'queued',
  progress: 0,
  stepProgress: 0,
  stepMessage: '',
  completedChunks: 0,
  totalChunks: 0,
  currentText: '等待服务器响应...',
  error: null,
  model: null,
  targetLanguage: null,
  outputMode: 'translated',
  subtitleFormat: 'srt',
  bilingualLayout: 'translated_first',
  sourceType: '',
  sourceLanguage: '',
  asrConfidence: null,
  asrRunId: null,
  translationMode: 'non_stream',
  filePath: '',
  rootName: '',
  contentTitle: '',
  contentBackground: '',
  customInstructions: '',
  createdAt: '',
  updatedAt: '',
  startedAt: '',
  stepStartedAt: '',
  finishedAt: '',
  pausedAt: '',
  pausedTotalMs: 0,
  pauseRequested: false,
  pauseRequestedAt: '',
  reviewDiagnostics: { totalEntries: 0, needsReview: 0, issues: [] as Array<{ reason: string, count: number, subtitleIds: string[] }> }
})

const outputModeLabels: Record<string, string> = {
  translated: '仅译文',
  bilingual: '双语',
  original: '仅原文字幕'
}
const subtitleFormatLabels: Record<string, string> = {
  srt: 'SRT',
  ass: 'ASS',
  both: 'SRT + ASS'
}
const bilingualLayoutLabels: Record<string, string> = {
  translated_first: '译文在上',
  original_first: '原文在上'
}
const sourceTypeLabels: Record<string, string> = {
  auto: '自动判断',
  embedded: '内嵌字幕',
  external: '外挂字幕',
  asr: '语音识别',
  ocr: '图像字幕 OCR'
}
const taskOutputSummary = computed(() => {
  const mode = outputModeLabels[String(task.value.outputMode || 'translated')] || task.value.outputMode || '仅译文'
  const format = subtitleFormatLabels[String(task.value.subtitleFormat || 'srt')] || task.value.subtitleFormat || 'SRT'
  const layout = task.value.outputMode === 'bilingual'
    ? `（${bilingualLayoutLabels[String(task.value.bilingualLayout || 'translated_first')] || '译文在上'}）`
    : ''
  return `${mode}${layout} · ${format}`
})
const sourceTypeLabel = computed(() => sourceTypeLabels[String(task.value.sourceType || 'auto')] || task.value.sourceType || '自动判断')
const isSourceRecognitionStage = computed(() => (
  ['asr', 'ocr'].includes(String(task.value.sourceType || ''))
  && ['probing', 'extracting', 'extracting_audio', 'transcribing', 'ocr', 'paused'].includes(String(task.value.step || ''))
))
const modelDisplayText = computed(() => {
  const model = task.value.model || '默认多模态模型'
  if (String(task.value.outputMode || '') === 'original') return '未使用（仅原文）'
  if (isSourceRecognitionStage.value) return `${model}（翻译阶段使用）`
  return model
})
const showTranslationChunkProgress = computed(() => (
  Number(task.value.totalChunks || 0) > 0
  || ['parsing', 'translating', 'exporting', 'done', 'review'].includes(String(task.value.step || ''))
))
const showRecognitionProgress = computed(() => isSourceRecognitionStage.value && !showTranslationChunkProgress.value)

const pageTitle = computed(() => {
  const status = String(task.value?.step || '')
  const progress = Number(task.value?.progress || 0)

  if (status === 'review') return '字幕待核对 - SubX'
  if (status === 'done') return '翻译任务完成 - SubX'
  if (status === 'error') return '翻译任务失败 - SubX'
  if (status === 'cancelled') return '翻译任务已取消 - SubX'
  if (['queued', 'probing', 'extracting', 'extracting_audio', 'transcribing', 'ocr', 'parsing', 'translating', 'exporting'].includes(status)) return `翻译任务进行中 (${progress}%) - SubX`
  return '翻译任务详情 - SubX'
})

useHead(() => ({
  title: pageTitle.value
}))
const taskId = route.params.id



const showResponses = ref(false)
const responsesLoading = ref(false)
const responsesRecords = ref<any[]>([])
const responsesSummary = ref<any>(null)
const responseDiagnosticsSummary = computed(() => {
  const diagnostics = responsesSummary.value?.diagnostics
  if (!diagnostics) return null
  const totalIssues = Number(diagnostics.emptyChunks || 0) + Number(diagnostics.refusalChunks || 0) + Number(diagnostics.filteredChunks || 0)
  const overviewParts = [
    `异常块 ${totalIssues} 个`,
    `缺条块 ${Number(diagnostics.missingIdChunks || 0)} 个`,
    `重试块 ${Number(diagnostics.retriedChunks || 0)} 个`,
    `回退块 ${Number(diagnostics.fallbackChunks || 0)} 个`
  ]
  return {
    ...diagnostics,
    totalIssues,
    overviewText: overviewParts.join(' · ')
  }
})
const showDiagnosticsSection = computed(() => !!connectionBanner.value || task.value.step === 'done')
const cancelling = ref(false)
const pausing = ref(false)
const resuming = ref(false)
const pausePending = computed(() => Boolean(task.value.pauseRequested) && task.value.step !== 'paused')
const statusBadgeLabel = computed(() => pausePending.value ? '暂停中（等待当前分段完成）' : '')
const statusBadgeStatus = computed(() => pausePending.value ? 'paused' : String(task.value.step || ''))
watch(() => task.value.step, (next) => {
  if (next === 'paused') {
    task.value.pauseRequested = false
    task.value.pauseRequestedAt = ''
  }
})
const canPauseTask = computed(() => !task.value.pauseRequested && (task.value.sourceType === 'asr' || ['extracting_audio', 'transcribing'].includes(String(task.value.step))) && !['parsing', 'translating', 'exporting', 'review', 'done', 'error', 'cancelled', 'paused'].includes(String(task.value.step)))
const toast = useToast()
const eventSource = ref<EventSource | null>(null)
const reconnectTimer = ref<ReturnType<typeof setTimeout> | null>(null)
type TaskLogView = { id?: number, type: 'info' | 'error', message: string, timestamp: string, category?: 'system' | 'translation' | 'export' | 'error' | 'process' }
const logs = ref<TaskLogView[]>([])
const currentTextTimestamp = ref('')
const logKeys = ref(new Set<string>())
const connectionState = ref<'connecting' | 'connected' | 'reconnecting' | 'disconnected' | 'history-only' | 'idle'>('connecting')
const reconnectStatusText = ref('')
const riskTagLabels: Record<string, string> = {
  non_dialogue: '非对白内容',
  lyrics: '歌词/吟唱',
  formatting_tokens: '格式标记密集',
  repeated_short_lines: '短句重复较多',
  punctuation_heavy: '符号密集',
  speaker_labels: '说话人标签',
  mixed_language: '多语言混杂',
  long_lines: '长句较多'
}

function formatClock(date: Date | string = new Date()) {
  return formatClockInZone(date, timeZone)
}

const reviewDiagnosticsIssues = computed(() => Array.isArray(task.value.reviewDiagnostics?.issues) ? task.value.reviewDiagnostics.issues : [])

function riskTagLabel(tag: string) {
  return riskTagLabels[tag] || tag
}

function formatTime(value?: string | null) {
  if (!value) return formatClock()
  return formatClockInZone(value, timeZone)
}

async function fetchResponses() {
  responsesLoading.value = true
  try {
    const data = await $fetch(`/api/tasks/${taskId}/responses`)
    responsesRecords.value = data.records || []
    responsesSummary.value = data.summary || null
  } catch (e) {
    console.error('[Responses] Failed to fetch:', e)
  } finally {
    responsesLoading.value = false
  }
}

watch(showResponses, (val) => {
  if (val && task.value.step === 'done') fetchResponses()
})

function downloadSrt() {
  window.location.assign(`/api/tasks/${taskId}/download`)
}

function downloadOriginal() {
  window.location.assign(`/api/tasks/${taskId}/download-original`)
}

function openReviewPage(subtitleId?: string) {
  const query = subtitleId ? `?focus=${encodeURIComponent(String(subtitleId))}` : ''
  navigateTo(`/review/${taskId}${query}`)
}

async function pauseTask() {
  pausing.value = true
  try {
    const result: any = await $fetch(`/api/tasks/${taskId}/pause`, { method: 'POST' })
    if (result?.pending) {
      task.value.pauseRequested = true
      if (result?.pauseRequestedAt) task.value.pauseRequestedAt = result.pauseRequestedAt
      task.value.stepMessage = '正在暂停，等待当前识别分段完成'
      appendLog({ type: 'info', message: '已请求暂停，将在当前识别分段完成后停止。', timestamp: formatClock(), category: 'system' })
      toast.add({ title: '已发送暂停请求', description: '将在当前识别分段完成后停止。', color: 'warning' })
    } else {
      task.value.step = 'paused'
      task.value.pauseRequested = false
      task.value.pauseRequestedAt = ''
      task.value.stepMessage = '任务已暂停，已完成识别分段已保存'
      task.value.currentText = null
      appendLog({ type: 'info', message: '任务已暂停，已完成识别分段已保存。', timestamp: formatClock(), category: 'system' })
      toast.add({ title: '已暂停', description: '任务已暂停，可稍后继续。', color: 'warning' })
    }
  } catch (e: any) {
    toast.add({ title: '暂停失败', description: e?.data?.message || e?.message || '无法暂停任务', color: 'error' })
  } finally {
    pausing.value = false
  }
}

async function resumeTask() {
  resuming.value = true
  try {
    await $fetch(`/api/tasks/${taskId}/resume`, { method: 'POST' })
    task.value.step = 'queued'
    task.value.pauseRequested = false
    task.value.pauseRequestedAt = ''
    task.value.stepMessage = '正在恢复任务...'
    appendLog({ type: 'info', message: '任务已恢复，将复用已完成的识别分段。', timestamp: formatClock(), category: 'system' })
    toast.add({ title: '已恢复', description: '任务将复用已完成的识别分段继续执行。', color: 'success' })
  } catch (e: any) {
    toast.add({ title: '恢复失败', description: e?.data?.message || e?.message || '无法恢复任务', color: 'error' })
  } finally {
    resuming.value = false
  }
}

async function cancelTask() {
  cancelling.value = true
  try {
    await $fetch(`/api/tasks/${taskId}/cancel`, { method: 'POST' })
    task.value.step = 'cancelled'
    task.value.error = '用户取消任务'
    task.value.currentText = null
    appendLog({ type: 'error', message: '任务已被手动取消', timestamp: formatClock(), category: 'error' })
    if (eventSource.value) eventSource.value.close()
    toast.add({ title: '取消成功', description: '任务已取消', color: 'success' })
  } catch {
    toast.add({ title: '取消失败', description: '无法取消任务', color: 'error' })
  } finally {
    cancelling.value = false
  }
}

function logEntryKey(entry: TaskLogView) {
  return entry.id ? `id:${entry.id}` : [entry.type, entry.timestamp, entry.category || '', entry.message].join('|')
}

function appendLog(entry: TaskLogView) {
  const key = logEntryKey(entry)
  if (logKeys.value.has(key)) return
  logKeys.value.add(key)
  logs.value.push(entry)
  const maxLogs = 2000
  if (logs.value.length > maxLogs) {
    const removed = logs.value.splice(0, logs.value.length - maxLogs)
    for (const old of removed) {
      logKeys.value.delete(logEntryKey(old))
    }
  }
}

function resetLogs(entries: TaskLogView[]) {
  logs.value = []
  logKeys.value = new Set()
  for (const entry of entries) appendLog(entry)
}

const stepProgressValue = computed(() => Math.max(0, Math.min(100, Number(task.value.stepProgress || 0))))
const showStepProgress = computed(() => ['probing', 'extracting', 'extracting_audio', 'transcribing', 'ocr', 'parsing', 'translating', 'exporting', 'paused'].includes(String(task.value.step || '')))

const statusLabel = computed(() => {
  if (pausePending.value) return '暂停中（等待当前分段完成）'
  switch (task.value.step) {
    case 'queued': return '队列中'
    case 'probing': return '正在分析媒体'
    case 'extracting': return '正在提取字幕'
    case 'extracting_audio': return '正在提取音频'
    case 'transcribing': return '正在语音识别'
    case 'ocr': return '正在 OCR 识别图像字幕'
    case 'parsing': return '正在解析文本分块'
    case 'translating': return 'AI 翻译进行中'
    case 'exporting': return '正在生成输出文件'
    case 'paused': return '任务已暂停'
    case 'cancelled': return '任务已取消'
    case 'done': return '任务圆满完成'
    case 'error': return '任务失败'
    default: return '正在处理...'
  }
})

const connectionBanner = computed(() => {
  if (task.value.step === 'done' || task.value.step === 'error' || task.value.step === 'review' || task.value.step === 'cancelled') {
    return {
      title: '历史记录模式',
      message: '当前展示的是已持久化的任务日志，无需保持实时连接。',
      icon: 'i-lucide-history',
      iconClass: 'text-gray-500',
      titleClass: 'text-gray-800 dark:text-gray-200',
      textClass: 'text-gray-600 dark:text-gray-400'
    }
  }

  switch (connectionState.value) {
    case 'connecting':
      return {
        title: '正在连接实时进度',
        message: '页面正在与任务实时进度流建立连接。',
        icon: 'i-lucide-loader-2',
        iconClass: 'text-primary-700 animate-spin',
        titleClass: 'text-primary-800 dark:text-primary-300',
        textClass: 'text-primary-700 dark:text-primary-400'
      }
    case 'connected':
      return {
        title: '实时连接正常',
        message: '当前页面正在接收任务执行中的实时进度。',
        icon: 'i-lucide-wifi',
        iconClass: 'text-emerald-500',
        titleClass: 'text-emerald-800 dark:text-emerald-300',
        textClass: 'text-emerald-700 dark:text-emerald-400'
      }
    case 'reconnecting':
      return {
        title: '实时连接中断，正在重连',
        message: reconnectStatusText.value || '页面会自动重试连接，不影响后台任务继续执行。',
        icon: 'i-lucide-refresh-cw',
        iconClass: 'text-amber-500 animate-spin',
        titleClass: 'text-amber-800 dark:text-amber-300',
        textClass: 'text-amber-700 dark:text-amber-400'
      }
    case 'disconnected':
      return {
        title: '实时连接已断开',
        message: '请刷新页面以重新获取最新任务状态。',
        icon: 'i-lucide-unplug',
        iconClass: 'text-red-500',
        titleClass: 'text-red-800 dark:text-red-300',
        textClass: 'text-red-700 dark:text-red-400'
      }
    default:
      return null
  }
})

const connectionBannerClass = computed(() => {
  switch (connectionState.value) {
    case 'connecting':
      return 'bg-primary-50 dark:bg-primary-900/20 border-primary-200 dark:border-primary-800'
    case 'connected':
      return 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800'
    case 'reconnecting':
      return 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800'
    case 'disconnected':
      return 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
    default:
      return 'bg-gray-50 dark:bg-gray-900/20 border-gray-200 dark:border-gray-800'
  }
})

const translationModeLabel = computed(() => task.value.translationMode === 'stream' ? '流式' : '非流式')

function normalizeFailureMessage(message?: string | null) {
  return String(message || '').replace(/^!!!\s*/, '').trim()
}

const failureSummary = computed(() => {
  if (task.value.step !== 'error') return null

  const sourceText = normalizeFailureMessage(task.value.error) || normalizeFailureMessage(logs.value.slice().reverse().find(log => log.type === 'error')?.message)
  if (!sourceText) return null

  if (sourceText.includes('[条目缺失]')) {
    return {
      icon: 'i-lucide-list-x',
      title: '翻译返回不完整',
      summary: '模型有响应，但缺少部分字幕条目。系统通常会自动重试缺失条目。',
      typeLabel: '缺少条目',
      detail: sourceText.replace('[条目缺失]', '').trim() || '部分字幕条目未返回'
    }
  }

  if (sourceText.includes('[解析为空]')) {
    return {
      icon: 'i-lucide-file-search',
      title: '返回内容无法解析',
      summary: '模型返回了内容，但格式不符合预期，无法还原成逐条字幕。',
      typeLabel: '解析异常',
      detail: sourceText.replace('[解析为空]', '').trim() || '返回内容为空或格式异常'
    }
  }

  if (sourceText.includes('[疑似拒答]')) {
    return {
      icon: 'i-lucide-shield-alert',
      title: '模型疑似拒答或被拦截',
      summary: '模型可能触发了安全策略，没有返回可用译文。',
      typeLabel: '拒答/拦截',
      detail: sourceText.replace('[疑似拒答]', '').trim() || '未产出可用译文'
    }
  }

  if (sourceText.includes('[无有效译文]')) {
    return {
      icon: 'i-lucide-message-circle-warning',
      title: '返回了内容，但没有有效译文',
      summary: '模型可能输出了原文、空白内容，或输出内容不具备可用翻译价值。',
      typeLabel: '无有效译文',
      detail: sourceText.replace('[无有效译文]', '').trim() || '未检测到有效译文'
    }
  }

  if (/鉴权|api key|unauthorized|authentication/i.test(sourceText)) {
    return {
      icon: 'i-lucide-key-round',
      title: '鉴权配置异常',
      summary: '请优先检查接口密钥、服务商地址与模型配置是否正确。',
      typeLabel: '鉴权失败',
      detail: sourceText
    }
  }

  if (/OCR 最大处理时长|视频时长.*超过 OCR|OCR_MAX_SECONDS/i.test(sourceText)) {
    return {
      icon: 'i-lucide-scan-text',
      title: '视频超出 OCR 处理上限',
      summary: '长视频 OCR 被时长上限拦截。可在「设置 → 图像字幕 OCR → 长视频与超时」调大最大 OCR 时长，或改用语音识别。',
      typeLabel: 'OCR 时长限制',
      detail: sourceText
    }
  }

  if (/OCR 长时间没有进度|OCR 任务超过最长执行时间|OCR 任务超时/i.test(sourceText)) {
    return {
      icon: 'i-lucide-timer-off',
      title: 'OCR 处理超时',
      summary: 'OCR 长时间没有进度或超过总任务上限。可调大无进度超时/总任务上限，或缩短分段时长。',
      typeLabel: 'OCR 超时',
      detail: sourceText
    }
  }

  if (/超时|timeout|timed out/i.test(sourceText)) {
    return {
      icon: 'i-lucide-timer-off',
      title: '请求超时',
      summary: '可能是网络波动、模型响应慢，或当前请求过大。',
      typeLabel: '超时',
      detail: sourceText
    }
  }

  if (/网络|network|fetch failed|econnreset|enotfound/i.test(sourceText)) {
    return {
      icon: 'i-lucide-wifi-off',
      title: '网络连接异常',
      summary: '当前任务未能稳定连接模型服务。',
      typeLabel: '网络异常',
      detail: sourceText
    }
  }

  return {
    icon: 'i-lucide-circle-alert',
    title: '任务执行失败',
    summary: '请先看失败类型与关键细节，再决定是否重试或调整配置。',
    typeLabel: '其他问题',
    detail: sourceText
  }
})

const stepIcon = computed(() => {
  switch (task.value.step) {
    case 'queued': return 'i-lucide-clock'
    case 'probing': return 'i-lucide-scan-search'
    case 'extracting': return 'i-lucide-scissors'
    case 'extracting_audio': return 'i-lucide-audio-lines'
    case 'transcribing': return 'i-lucide-mic'
    case 'ocr': return 'i-lucide-scan-text'
    case 'parsing': return 'i-lucide-binary'
    case 'translating': return 'i-lucide-brain'
    case 'exporting': return 'i-lucide-file-output'
    case 'paused': return 'i-lucide-pause-circle'
    case 'review': return 'i-lucide-list-checks'
    case 'done': return 'i-lucide-check-circle-2'
    case 'cancelled': return 'i-lucide-ban'
    case 'error': return 'i-lucide-x-circle'
    default: return 'i-lucide-loader-2'
  }
})

onUnmounted(() => {
  if (eventSource.value) eventSource.value.close()
  if (reconnectTimer.value) clearTimeout(reconnectTimer.value)
  stopAsrPolling()
})

const ASR_POLL_MS = 8_000
const isTerminalTask = computed(() => ['done', 'error', 'cancelled', 'review'].includes(String(task.value.step || '')))
const asrPartialStatusText = computed(() => {
  if (asrRun.value) return '识别完成'
  if (task.value.pauseRequested && task.value.step !== 'paused') return '暂停中，等待当前分段完成'
  if (task.value.step === 'paused') return '语音识别已暂停'
  if (isTerminalTask.value) return '语音识别已结束'
  if (task.value.step === 'extracting_audio') return '正在准备音频'
  return '语音识别进行中'
})

function canLoadAsrDetails() {
  return ['asr', 'ocr'].includes(task.value.sourceType)
    || ['extracting_audio', 'transcribing', 'paused'].includes(String(task.value.step || ''))
}

function shouldPollAsrDetails() {
  if (activeTab.value !== 'asr') return false
  if (!canLoadAsrDetails()) return false
  return ['extracting_audio', 'transcribing', 'paused'].includes(String(task.value.step || ''))
}

function stopAsrPolling() {
  if (asrPollTimer) {
    clearInterval(asrPollTimer)
    asrPollTimer = null
  }
}

function startAsrPolling() {
  stopAsrPolling()
  if (!shouldPollAsrDetails()) return
  asrPollTimer = setInterval(() => {
    if (document.hidden) return
    if (!shouldPollAsrDetails()) {
      stopAsrPolling()
      return
    }
    void loadAsrDetails(true)
  }, ASR_POLL_MS)
}

async function loadAsrDetails(silent = false) {
  if (!canLoadAsrDetails() || (silent && asrLoading.value)) return
  if (!silent) asrLoading.value = true
  try {
    const result: any = await $fetch(`/api/tasks/${taskId}/asr`)
    asrRun.value = result?.run || null
    asrPartial.value = result?.partial || null
    asrSegments.value = result?.segments || []
  } catch (e) {
    if (!silent) console.warn('[Task] Failed to load ASR details', e)
  } finally {
    if (!silent) asrLoading.value = false
  }
}

watch(activeTab, (tab) => {
  if (tab === 'asr') {
    void loadAsrDetails()
    startAsrPolling()
  } else {
    stopAsrPolling()
  }
})

watch(() => [task.value.step, task.value.sourceType], () => {
  if (activeTab.value !== 'asr') return
  if (canLoadAsrDetails()) void loadAsrDetails(true)
  if (shouldPollAsrDetails()) startAsrPolling()
  else stopAsrPolling()
})

onMounted(async () => {
  try {
    const [result, logResult, qualityResult] = await Promise.all([
      $fetch(`/api/tasks/${taskId}`),
      $fetch(`/api/tasks/${taskId}/logs`).catch(() => ({ logs: [] })),
      $fetch(`/api/tasks/${taskId}/quality`).catch(() => ({ quality: null }))
    ])
    qualityRun.value = (qualityResult as any)?.quality || null
    qualityThreshold.value = Number((qualityResult as any)?.threshold ?? 0.7)
    const initialTask = result?.task
    const historyLogs = (logResult as any)?.logs || []

    if (initialTask) {
      task.value = {
        ...task.value,
        step: initialTask.status,
        progress: initialTask.progress || 0,
        stepProgress: initialTask.stepProgress || 0,
        stepMessage: initialTask.stepMessage || '',
        completedChunks: initialTask.completedChunks || 0,
        totalChunks: initialTask.totalChunks || 0,
        error: initialTask.error || null,
        model: initialTask.model,
        targetLanguage: initialTask.targetLanguage,
        outputMode: initialTask.outputMode || 'translated',
        subtitleFormat: initialTask.subtitleFormat || 'srt',
        bilingualLayout: initialTask.bilingualLayout || 'translated_first',
        sourceType: initialTask.sourceType || '',
        sourceLanguage: initialTask.sourceLanguage || '',
        asrConfidence: initialTask.asrConfidence ?? null,
        asrRunId: initialTask.asrRunId ?? null,
        filePath: initialTask.filePath || '',
        rootName: initialTask.rootName || '',
        contentTitle: initialTask.contentTitle || '',
        contentBackground: initialTask.contentBackground || '',
        customInstructions: initialTask.customInstructions || '',
        createdAt: initialTask.createdAt || '',
        updatedAt: initialTask.updatedAt || '',
        startedAt: initialTask.startedAt || '',
        stepStartedAt: initialTask.stepStartedAt || '',
        finishedAt: initialTask.finishedAt || '',
        pausedAt: initialTask.pausedAt || '',
        pausedTotalMs: Number(initialTask.pausedTotalMs || 0),
        pauseRequested: Boolean(initialTask.pauseRequested),
        pauseRequestedAt: initialTask.pauseRequestedAt || ''
      }
    }

    if (historyLogs.length > 0) {
      resetLogs(historyLogs.map((log: any) => ({
        id: Number(log.id) || undefined,
        type: log.level === 'error' ? 'error' : 'info',
        category: log.category || undefined,
        message: log.message,
        timestamp: formatTime(log.createdAt)
      })))
    } else if ((initialTask?.status === 'error' || initialTask?.status === 'cancelled') && initialTask.error) {
      resetLogs([{ type: 'error', message: `任务失败: ${initialTask.error}`, timestamp: formatClock(), category: 'error' }])
      task.value.currentText = null
      connectionState.value = 'history-only'
    } else if (initialTask?.status === 'done' || initialTask?.status === 'cancelled') {
      task.value.currentText = null
      connectionState.value = 'history-only'
    }
  } catch (e) {
    console.warn('[Task] Unable to fetch initial task state', e)
  }

  if (task.value.step === 'done' || task.value.step === 'error' || task.value.step === 'review' || task.value.step === 'cancelled') {
    task.value.currentText = null
    connectionState.value = 'history-only'
    return
  }

  let reconnectAttempts = 0
  const MAX_RECONNECT_ATTEMPTS = 10
  const BASE_RECONNECT_DELAY = 1000
  let lastLoggedStep = task.value.step || null
  let isIntentionalClose = false

  async function syncTaskSnapshot() {
    try {
      const result: any = await $fetch(`/api/tasks/${taskId}`)
      const snapshot = result?.task
      if (!snapshot) return false
      task.value = {
        ...task.value,
        step: snapshot.status,
        progress: snapshot.progress || 0,
        stepProgress: snapshot.stepProgress || 0,
        stepMessage: snapshot.stepMessage || '',
        completedChunks: snapshot.completedChunks || 0,
        totalChunks: snapshot.totalChunks || 0,
        error: snapshot.error || null,
        sourceType: snapshot.sourceType || task.value.sourceType,
        sourceLanguage: snapshot.sourceLanguage || task.value.sourceLanguage,
        asrConfidence: snapshot.asrConfidence ?? task.value.asrConfidence,
        asrRunId: snapshot.asrRunId ?? task.value.asrRunId,
        createdAt: snapshot.createdAt || task.value.createdAt,
        updatedAt: snapshot.updatedAt || task.value.updatedAt,
        startedAt: snapshot.startedAt || task.value.startedAt,
        stepStartedAt: snapshot.stepStartedAt || task.value.stepStartedAt,
        finishedAt: snapshot.finishedAt || task.value.finishedAt,
        pausedAt: snapshot.pausedAt || task.value.pausedAt,
        pausedTotalMs: Number(snapshot.pausedTotalMs ?? task.value.pausedTotalMs ?? 0),
        pauseRequested: Boolean(snapshot.pauseRequested ?? task.value.pauseRequested),
        pauseRequestedAt: snapshot.pauseRequestedAt || task.value.pauseRequestedAt,
        currentText: ['done', 'error', 'review', 'cancelled'].includes(String(snapshot.status)) ? null : task.value.currentText
      }
      return ['done', 'error', 'review', 'cancelled'].includes(String(snapshot.status))
    } catch {
      return false
    }
  }

  async function connectSSE() {
    connectionState.value = reconnectAttempts > 0 ? 'reconnecting' : 'connecting'
    try {
      const terminal = await syncTaskSnapshot()
      if (terminal) {
        connectionState.value = 'history-only'
        return
      }
    } catch { /* use stream fallback */ }
    const es = new EventSource(`/api/sse/progress?taskId=${taskId}`)
    eventSource.value = es

    const handleTerminalEvent = (raw: MessageEvent, terminalStep: 'done' | 'error' | 'cancelled') => {
      reconnectAttempts = 0
      reconnectStatusText.value = ''
      connectionState.value = 'history-only'
      const data = JSON.parse(raw.data)
      task.value = { ...task.value, ...data, step: terminalStep, currentText: null }
      isIntentionalClose = true
      if (reconnectTimer.value) {
        clearTimeout(reconnectTimer.value)
        reconnectTimer.value = null
      }
      es.close()
    }

    es.addEventListener('progress', (e) => {
      reconnectAttempts = 0
      reconnectStatusText.value = ''
      connectionState.value = 'connected'
      const data = JSON.parse(e.data)
      task.value = { ...task.value, ...data }

      if (data.step === 'done' || data.step === 'error' || data.step === 'review' || data.step === 'cancelled') {
        isIntentionalClose = true
        if (reconnectTimer.value) {
          clearTimeout(reconnectTimer.value)
          reconnectTimer.value = null
        }
        es.close()
      }

      if (data.step && data.step !== lastLoggedStep) {
        lastLoggedStep = data.step
        void syncTaskSnapshot()
        if (!data.log) {
          const stepNames = {
            queued: '入队',
            probing: '分析媒体',
            extracting: '提取字幕',
            extracting_audio: '提取音频',
            transcribing: '语音识别',
            ocr: '图像字幕 OCR',
            parsing: '解析文本',
            translating: 'AI 翻译',
            exporting: '导出文件',
            review: '字幕核对',
            paused: '已暂停',
            done: '完成',
            cancelled: '已取消',
            error: '出错'
          }
          const currentStepName = (stepNames as Record<string, string>)[data.step] || data.step
          appendLog({
            type: data.step === 'error' || data.step === 'cancelled' ? 'error' : 'info',
            category: data.step === 'error' || data.step === 'cancelled' ? 'error' : 'system',
            message: data.step === 'error' ? '状态变更: 任务失败' : data.step === 'cancelled' ? '状态变更: 任务已取消' : `状态变更: ${currentStepName}`,
            timestamp: formatClock()
          })
        }
      }

      if (data.log) {
        appendLog({
          id: Number(data.logId) || undefined,
          type: data.step === 'error' || data.step === 'cancelled' || data.log.includes('!!!') ? 'error' : 'info',
          category: data.category || undefined,
          message: data.log,
          timestamp: formatClock()
        })
      }
    })

    es.addEventListener('done', (e) => handleTerminalEvent(e as MessageEvent, 'done'))
    es.addEventListener('task-error', (e) => handleTerminalEvent(e as MessageEvent, 'error'))
    es.addEventListener('cancelled', (e) => handleTerminalEvent(e as MessageEvent, 'cancelled'))

    es.onerror = () => {
      es.close()
      if (isIntentionalClose) return
      if (task.value.step === 'done' || task.value.step === 'error' || task.value.step === 'review' || task.value.step === 'cancelled') {
        connectionState.value = 'history-only'
        return
      }

      if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
        const delay = Math.min(BASE_RECONNECT_DELAY * Math.pow(2, reconnectAttempts), 30000)
        reconnectAttempts++
        appendLog({ type: 'info', message: `连接中断，${delay / 1000}s 后自动重连 (${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})...`, timestamp: formatClock() })
        if (reconnectTimer.value) clearTimeout(reconnectTimer.value)
        reconnectTimer.value = setTimeout(connectSSE, delay)
      } else {
        connectionState.value = 'disconnected'
        reconnectStatusText.value = ''
      }
    }
  }

  connectSSE()
})
</script>

<style>
.custom-scrollbar::-webkit-scrollbar { width: 4px; }
.custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
.custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 2px; }
</style>
