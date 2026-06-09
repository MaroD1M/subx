<template>
  <div class="max-w-4xl mx-auto space-y-8 py-10">
    <div class="flex flex-col sm:flex-row sm:items-start gap-4 mb-8">
      <UButton icon="i-lucide-arrow-left" variant="ghost" color="neutral" to="/history" />
      <div class="flex flex-col min-w-0 flex-1 gap-1.5">
        <h2 class="text-2xl font-bold text-gray-900 dark:text-white">{{ task.step === 'done' ? '翻译任务完成' : task.step === 'error' ? '翻译任务失败' : task.step === 'review' ? '字幕待核对' : '翻译任务进行中' }}</h2>
        <p class="text-sm text-neutral-500 break-all">任务 ID: {{ $route.params.id }}</p>
        <p v-if="task.filePath" class="text-xs text-neutral-400 break-all">{{ task.rootName || '默认媒体库' }} · {{ task.filePath }}</p>
      </div>
    </div>

    <div class="glass-panel rounded-3xl overflow-hidden mb-6 p-2">
      <div class="p-8 space-y-8">
        <div class="space-y-4">
          <div class="flex justify-between items-end mb-2">
            <div class="flex flex-col">
              <span class="text-xs font-semibold text-primary-500 uppercase tracking-wider mb-1">{{ task.step }}</span>
              <h3 class="text-lg font-bold text-gray-800 dark:text-gray-200">
                <UIcon :name="stepIcon" class="mr-2 text-emerald-500" v-if="task.step === 'done'" />
                <UIcon :name="stepIcon" class="mr-2 text-red-500" v-else-if="task.step === 'error'" />
                <UIcon :name="stepIcon" class="mr-2 animate-pulse text-primary-500" v-else />
                {{ statusLabel }}
              </h3>
            </div>
            <div class="text-right">
              <span class="text-3xl font-black text-gray-900 dark:text-white tracking-tighter">{{ task.step === 'done' ? 100 : task.progress }}%</span>
            </div>
          </div>
          <UProgress :model-value="task.step === 'done' ? 100 : task.progress" size="xl" :color="task.step === 'error' ? 'error' : task.step === 'done' ? 'success' : 'primary'" class="h-3 rounded-full overflow-hidden" />
        </div>

        <div v-if="task.step === 'error' && task.error" class="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-4 rounded-2xl flex items-start gap-3">
          <UIcon name="i-lucide-alert-circle" class="w-5 h-5 text-red-500 mt-0.5" />
          <div class="space-y-1">
            <p class="text-sm font-bold text-red-800 dark:text-red-200">处理出错</p>
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
          <div class="grid gap-2 sm:grid-cols-3 text-xs">
            <div class="rounded-xl bg-white/70 dark:bg-black/10 px-3 py-2">
              <p class="text-[10px] uppercase tracking-wider text-amber-600 dark:text-amber-400">失败类型</p>
              <p class="mt-1 font-medium text-amber-900 dark:text-amber-100">{{ failureSummary.typeLabel }}</p>
            </div>
            <div class="rounded-xl bg-white/70 dark:bg-black/10 px-3 py-2 sm:col-span-2">
              <p class="text-[10px] uppercase tracking-wider text-amber-600 dark:text-amber-400">关键细节</p>
              <p class="mt-1 font-medium text-amber-900 dark:text-amber-100 break-words">{{ failureSummary.detail }}</p>
            </div>
          </div>
        </div>

        <USeparator />

        <div class="grid grid-cols-2 lg:grid-cols-5 gap-6">
          <div class="space-y-1">
            <span class="text-[10px] text-neutral-500 uppercase font-bold tracking-widest">媒体库</span>
            <p class="text-sm font-medium text-gray-700 dark:text-gray-300">{{ task.rootName || '默认媒体库' }}</p>
          </div>
          <div class="space-y-1">
            <span class="text-[10px] text-neutral-500 uppercase font-bold tracking-widest">模型</span>
            <p class="text-sm font-medium text-gray-700 dark:text-gray-300">{{ task.model || '默认多模态模型' }}</p>
          </div>
          <div class="space-y-1">
            <span class="text-[10px] text-neutral-500 uppercase font-bold tracking-widest">目标语言</span>
            <p class="text-sm font-medium text-gray-700 dark:text-gray-300">{{ task.targetLanguage === 'zh-CN' ? '简体中文' : (task.targetLanguage || '自动') }}</p>
          </div>
          <div class="space-y-1">
            <span class="text-[10px] text-neutral-500 uppercase font-bold tracking-widest">分块进度</span>
            <p class="text-sm font-medium text-gray-700 dark:text-gray-300" v-if="task.step === 'done'">已完成</p>
            <p class="text-sm font-medium text-gray-700 dark:text-gray-300" v-else>{{ task.completedChunks || 0 }} / {{ task.totalChunks || '-' }}</p>
          </div>
          <div class="space-y-1">
            <span class="text-[10px] text-neutral-500 uppercase font-bold tracking-widest">任务状态</span>
            <p class="text-sm font-medium text-gray-700 dark:text-gray-300 capitalize">{{ task.step }}</p>
          </div>
        </div>

        <div class="rounded-2xl border border-gray-200/70 dark:border-white/10 bg-white/80 dark:bg-gray-950/80 p-4 shadow-sm relative backdrop-blur-sm">
          <div class="mb-4 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
            <div class="space-y-1">
              <div class="flex items-center gap-2 text-gray-700 dark:text-gray-200">
                <UIcon name="i-lucide-logs" class="w-4 h-4 text-primary-500" />
                <span class="text-sm font-semibold">任务执行日志</span>
              </div>
              <p class="text-xs text-gray-500 dark:text-gray-400">仅记录任务处理过程，不包含页面实时连接状态。</p>
            </div>
            <div class="flex items-center gap-2 self-start sm:self-auto">
              <UBadge color="neutral" variant="subtle">显示 {{ displayedLogs.length }} / {{ logs.length }} 条</UBadge>
              <UButton
                v-if="logs.length > compactLogLimit"
                :label="showAllLogs ? '收起次要日志' : '显示全部日志'"
                size="xs"
                color="neutral"
                variant="ghost"
                class="h-7 px-2"
                @click="showAllLogs = !showAllLogs"
              />
            </div>
          </div>
          <div class="space-y-3 h-56 overflow-y-auto custom-scrollbar pr-1 sm:pr-2" ref="logContainer">
            <div
              v-for="(log, i) in displayedLogs"
              :key="i"
              class="rounded-2xl border px-3 py-3 flex flex-col sm:flex-row items-start gap-3 shadow-sm"
              :class="logItemClass(log)"
            >
              <div class="flex w-full sm:w-auto flex-row sm:flex-col items-center sm:items-start justify-between gap-2 shrink-0 sm:min-w-[78px]">
                <ClientOnly><span class="text-[10px] text-gray-500 dark:text-gray-400 leading-none">{{ log.timestamp }}</span></ClientOnly>
                <UBadge size="sm" variant="soft" :color="logBadgeColor(log)" class="shrink-0">{{ logCategoryLabel(log) }}</UBadge>
              </div>
              <div class="min-w-0 w-full flex-1 border-t sm:border-t-0 sm:border-l border-black/5 dark:border-white/10 pt-3 sm:pt-0 sm:pl-3">
                <p class="text-sm leading-6 break-words" :class="logMessageClass(log)">{{ log.message }}</p>
              </div>
            </div>
            <div v-if="task.currentText" class="rounded-2xl border border-emerald-500/20 bg-emerald-50 dark:bg-emerald-500/10 px-3 py-3 flex flex-col sm:flex-row items-start gap-3 shadow-sm">
              <div class="flex w-full sm:w-auto flex-row sm:flex-col items-center sm:items-start justify-between gap-2 shrink-0 sm:min-w-[78px]">
                <ClientOnly><span class="text-[10px] text-gray-500 dark:text-gray-400 leading-none">{{ currentTextTimestamp || formatTime() }}</span></ClientOnly>
                <UBadge size="sm" variant="soft" color="success" class="shrink-0">实时进度</UBadge>
              </div>
              <div class="min-w-0 w-full flex-1 border-t sm:border-t-0 sm:border-l border-emerald-500/20 pt-3 sm:pt-0 sm:pl-3">
                <p class="text-sm leading-6 break-words text-emerald-700 dark:text-emerald-300">{{ task.currentText }}</p>
              </div>
            </div>
          </div>
        </div>

        <div class="flex items-center justify-between pt-4 gap-3 flex-wrap">
          <div class="flex items-center gap-3 flex-wrap">
            <UButton v-if="task.step === 'done'" label="下载结果" icon="i-lucide-download" color="primary" @click="downloadSrt" />
            <UButton v-if="task.step === 'review'" label="进入核对" icon="i-lucide-list-checks" color="warning" @click="openReviewPage" />
            <UButton v-if="task.step === 'done'" label="返回首页" icon="i-lucide-check-circle" color="secondary" to="/" />
            <UButton v-else-if="task.step === 'error'" label="返回历史" icon="i-lucide-history" color="neutral" to="/history" />
            <UButton v-else label="取消任务" icon="i-lucide-octagon-x" color="error" variant="soft" :loading="cancelling" @click="cancelTask" />
          </div>
        </div>

        <details v-if="showDiagnosticsSection" class="rounded-2xl border border-gray-200/70 dark:border-white/10 bg-white/70 dark:bg-gray-950/60 p-4">
          <summary class="cursor-pointer list-none flex items-center justify-between gap-3">
            <div>
              <p class="text-sm font-semibold text-gray-800 dark:text-gray-100">诊断信息</p>
              <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">连接状态、翻译模式与 Token 统计默认折叠显示。</p>
            </div>
            <UIcon name="i-lucide-chevron-down" class="w-4 h-4 text-gray-400" />
          </summary>

          <div class="mt-4 space-y-4">
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div class="rounded-xl border border-gray-100 dark:border-gray-800 bg-gray-50/70 dark:bg-gray-900/40 p-3">
                <p class="text-[10px] uppercase font-bold tracking-widest text-neutral-500">翻译模式</p>
                <p class="mt-1 text-sm font-medium text-gray-700 dark:text-gray-300">{{ translationModeLabel }}</p>
              </div>
              <div class="rounded-xl border border-gray-100 dark:border-gray-800 bg-gray-50/70 dark:bg-gray-900/40 p-3">
                <p class="text-[10px] uppercase font-bold tracking-widest text-neutral-500">连接状态</p>
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
                  <p v-else class="text-[11px] text-amber-700 dark:text-amber-300">暂无 ID</p>
                </div>
              </div>
            </div>

            <div v-if="task.step === 'done'" class="space-y-3">
              <div class="flex items-center justify-between">
                <UButton :label="showResponses ? '隐藏 Token 统计' : '查看 Token 统计'" icon="i-lucide-chart-column-big" color="neutral" variant="ghost" @click="showResponses = !showResponses" />
              </div>

              <div v-if="showResponses" class="rounded-2xl bg-gray-950 text-gray-100 p-4 ring-1 ring-white/10 space-y-4">
                <div v-if="responsesLoading" class="flex items-center gap-2 text-xs text-gray-400">
                  <UIcon name="i-lucide-loader-2" class="w-4 h-4 animate-spin" /> 加载 Token 统计...
                </div>
                <div v-else-if="responsesSummary" class="space-y-4">
                  <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div class="space-y-1"><span class="text-[10px] text-gray-600 uppercase font-bold">分块数</span><p class="text-sm font-medium text-gray-100">{{ responsesSummary.totalChunks }}</p></div>
                    <div class="space-y-1"><span class="text-[10px] text-gray-600 uppercase font-bold">输入 Tokens</span><p class="text-sm font-medium text-amber-400">{{ responsesSummary.totalPromptTokens.toLocaleString() }}</p></div>
                    <div class="space-y-1"><span class="text-[10px] text-gray-600 uppercase font-bold">输出 Tokens</span><p class="text-sm font-medium text-emerald-400">{{ responsesSummary.totalCompletionTokens.toLocaleString() }}</p></div>
                    <div class="space-y-1"><span class="text-[10px] text-gray-600 uppercase font-bold">总 Tokens</span><p class="text-sm font-medium text-primary-400">{{ responsesSummary.totalTokens.toLocaleString() }}</p></div>
                  </div>
                  <div class="space-y-3">
                    <div class="flex items-center gap-2 text-xs text-gray-400">
                      <UIcon name="i-lucide-messages-square" class="w-4 h-4" /> AI 返回预览（默认截断，便于快速排查）
                    </div>
                    <div class="space-y-3 max-h-80 overflow-y-auto custom-scrollbar pr-1">
                      <details v-for="r in responsesRecords" :key="`preview-${r.id}`" class="rounded-xl border border-gray-800/70 bg-black/20 px-3 py-3">
                        <summary class="cursor-pointer list-none flex items-center justify-between gap-3">
                          <div class="min-w-0">
                            <p class="text-xs font-semibold text-gray-200">块 #{{ (r.chunk_index || 0) + 1 }} · {{ r.model || 'unknown' }}</p>
                            <p class="mt-1 text-[11px] text-gray-400 line-clamp-2 break-words">{{ r.raw_response_preview || '暂无返回内容' }}</p>
                          </div>
                          <UIcon name="i-lucide-chevron-down" class="w-4 h-4 text-gray-500 shrink-0" />
                        </summary>
                        <div class="mt-3 grid gap-3 lg:grid-cols-2">
                          <div class="space-y-1 min-w-0">
                            <p class="text-[10px] uppercase tracking-widest text-gray-500">请求预览</p>
                            <pre class="text-[11px] leading-5 whitespace-pre-wrap break-words text-gray-400 max-h-48 overflow-y-auto custom-scrollbar">{{ r.raw_request || '暂无请求内容' }}</pre>
                          </div>
                          <div class="space-y-1 min-w-0">
                            <p class="text-[10px] uppercase tracking-widest text-gray-500">返回全文</p>
                            <pre class="text-[11px] leading-5 whitespace-pre-wrap break-words text-gray-200 max-h-48 overflow-y-auto custom-scrollbar">{{ r.raw_response || '暂无返回内容' }}</pre>
                          </div>
                        </div>
                      </details>
                    </div>
                  </div>
                  <div class="max-h-48 overflow-y-auto custom-scrollbar">
                    <table class="w-full text-left">
                      <thead>
                        <tr class="text-gray-600 text-[10px] uppercase"><th class="pb-2 pr-4">块</th><th class="pb-2 pr-4">模型</th><th class="pb-2 pr-4">输入</th><th class="pb-2 pr-4">输出</th><th class="pb-2">合计</th></tr>
                      </thead>
                      <tbody class="text-gray-400">
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
                <div v-else class="text-xs text-gray-400">暂无可用统计。</div>
              </div>
            </div>
          </div>
        </details>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
const route = useRoute()
const taskId = route.params.id

const task = ref({
  step: 'queued',
  progress: 0,
  completedChunks: 0,
  totalChunks: 0,
  currentText: '等待服务器响应...',
  error: null,
  model: null,
  targetLanguage: null,
  translationMode: 'non_stream',
  filePath: '',
  rootName: '',
  reviewDiagnostics: { totalEntries: 0, needsReview: 0, issues: [] as Array<{ reason: string, count: number, subtitleIds: string[] }> }
})

const showResponses = ref(false)
const responsesLoading = ref(false)
const responsesRecords = ref<any[]>([])
const responsesSummary = ref(null)
const showDiagnosticsSection = computed(() => !!connectionBanner.value || task.value.step === 'done')
const cancelling = ref(false)
const toast = useToast()
const logContainer = ref(null)
const eventSource = ref(null)
const reconnectTimer = ref(null)
const logs = ref<Array<{ type: 'info' | 'error', message: string, timestamp: string, category?: 'system' | 'translation' | 'export' | 'error' | 'process' }>>([])
const showAllLogs = ref(false)
const compactLogLimit = 12
const currentTextTimestamp = ref('')
const logKeys = ref(new Set<string>())
const connectionState = ref<'connecting' | 'connected' | 'reconnecting' | 'disconnected' | 'history-only' | 'idle'>('connecting')
const reconnectStatusText = ref('')
const reviewReasonLabels: Record<string, string> = {
  missing: '缺少译文',
  same_as_source: '译文与原文相同',
  same_as_source_allowed: '同文可接受',
  latin_heavy: '译文仍偏原语言',
  bilingual_duplicate: '双语内容重复',
  suspected_contamination: '疑似串条/混入相邻字幕',
  overlong_translation: '译文异常偏长'
}

function formatClock(date = new Date()) {
  return date.toLocaleTimeString('zh-CN', { hour12: false })
}

const reviewDiagnosticsIssues = computed(() => Array.isArray(task.value.reviewDiagnostics?.issues) ? task.value.reviewDiagnostics.issues : [])

function reviewReasonLabel(reason: string) {
  return reviewReasonLabels[reason] || reason
}

function formatTime(value?: string | null) {
  if (!value) return formatClock()
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  return formatClock(date)
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

function openReviewPage(subtitleId?: string) {
  const query = subtitleId ? `?focus=${encodeURIComponent(String(subtitleId))}` : ''
  navigateTo(`/task/${taskId}/review${query}`)
}

async function cancelTask() {
  cancelling.value = true
  try {
    await $fetch(`/api/tasks/${taskId}/cancel`, { method: 'POST' })
    task.value.step = 'error'
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

watch(logs, () => {
  nextTick(() => {
    if (logContainer.value) logContainer.value.scrollTop = logContainer.value.scrollHeight
  })
}, { deep: true })

function appendLog(entry: { type: 'info' | 'error', message: string, timestamp: string, category?: 'system' | 'translation' | 'export' | 'error' | 'process' }) {
  const key = [entry.type, entry.timestamp, entry.category || '', entry.message].join('|')
  if (logKeys.value.has(key)) return
  logKeys.value.add(key)
  logs.value.push(entry)
}

function resetLogs(entries: Array<{ type: 'info' | 'error', message: string, timestamp: string, category?: 'system' | 'translation' | 'export' | 'error' | 'process' }>) {
  logs.value = []
  logKeys.value = new Set()
  for (const entry of entries) appendLog(entry)
}

function resolveLogCategory(log: { type: 'info' | 'error', message: string, category?: 'system' | 'translation' | 'export' | 'error' | 'process' }) {
  if (log.category) return log.category
  const text = log.message || ''
  if (log.type === 'error' || /失败|错误|中断|断开|异常|取消|error/i.test(text)) return 'error'
  if (/导出|保存|输出文件|write/i.test(text)) return 'export'
  if (/翻译|文本块|chunk|tokens|模型|术语表|风格/i.test(text)) return 'translation'
  if (/提取|解析|SRT|字幕|初始化|队列|状态变更|创建|加载/i.test(text)) return 'system'
  return 'process'
}

function logCategoryLabel(log: { type: 'info' | 'error', message: string, category?: 'system' | 'translation' | 'export' | 'error' | 'process' }) {
  switch (resolveLogCategory(log)) {
    case 'error':
      return '错误'
    case 'export':
      return '导出'
    case 'translation':
      return '翻译'
    case 'system':
      return '系统'
    default:
      return '过程'
  }
}

function logBadgeColor(log: { type: 'info' | 'error', message: string, category?: 'system' | 'translation' | 'export' | 'error' | 'process' }) {
  switch (resolveLogCategory(log)) {
    case 'error':
      return 'error'
    case 'export':
      return 'success'
    case 'translation':
      return 'primary'
    case 'system':
      return 'warning'
    default:
      return 'neutral'
  }
}

const displayedLogs = computed(() => {
  if (showAllLogs.value || logs.value.length <= compactLogLimit) return logs.value

  const importantIndices = new Set<number>()
  for (let i = 0; i < logs.value.length; i++) {
    const log = logs.value[i]
    const category = resolveLogCategory(log)
    if (log.type === 'error' || category === 'system' || category === 'export') {
      importantIndices.add(i)
    }
  }

  const recentStart = Math.max(0, logs.value.length - 4)
  for (let i = recentStart; i < logs.value.length; i++) importantIndices.add(i)

  return logs.value.filter((_, index) => importantIndices.has(index))
})

watch(() => task.value.currentText, (value) => {
  if (value) currentTextTimestamp.value = formatTime()
})

function logItemClass(log: { type: 'info' | 'error', message: string, category?: 'system' | 'translation' | 'export' | 'error' | 'process' }) {
  switch (resolveLogCategory(log)) {
    case 'error':
      return 'border-red-200 dark:border-red-500/20 bg-red-50 dark:bg-red-500/10'
    case 'export':
      return 'border-emerald-200 dark:border-emerald-500/20 bg-emerald-50 dark:bg-emerald-500/10'
    case 'translation':
      return 'border-primary-200 dark:border-primary-500/20 bg-primary-50 dark:bg-primary-500/10'
    case 'system':
      return 'border-amber-200 dark:border-amber-500/20 bg-amber-50 dark:bg-amber-500/10'
    default:
      return 'border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-white/5'
  }
}

function logMessageClass(log: { type: 'info' | 'error', message: string, category?: 'system' | 'translation' | 'export' | 'error' | 'process' }) {
  switch (resolveLogCategory(log)) {
    case 'error':
      return 'text-red-700 dark:text-red-300'
    case 'export':
      return 'text-emerald-700 dark:text-emerald-300'
    case 'translation':
      return 'text-primary-700 dark:text-primary-200'
    case 'system':
      return 'text-amber-700 dark:text-amber-200'
    default:
      return 'text-gray-700 dark:text-gray-300'
  }
}

const statusLabel = computed(() => {
  switch (task.value.step) {
    case 'queued': return '队列中'
    case 'extracting': return '正在提取字幕'
    case 'parsing': return '正在解析文本分块'
    case 'translating': return 'AI 翻译进行中'
    case 'exporting': return '正在生成输出文件'
    case 'done': return '任务圆满完成'
    case 'error': return '任务失败'
    default: return '正在处理...'
  }
})

const connectionBanner = computed(() => {
  if (task.value.step === 'done' || task.value.step === 'error' || task.value.step === 'review') {
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
        iconClass: 'text-primary-500 animate-spin',
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
      summary: '请优先检查 API Key、供应商地址与模型配置是否正确。',
      typeLabel: '鉴权失败',
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
    case 'extracting': return 'i-lucide-scissors'
    case 'parsing': return 'i-lucide-binary'
    case 'translating': return 'i-lucide-brain'
    case 'exporting': return 'i-lucide-file-output'
    case 'review': return 'i-lucide-list-checks'
    case 'done': return 'i-lucide-check-circle-2'
    case 'error': return 'i-lucide-x-circle'
    default: return 'i-lucide-loader-2'
  }
})

onUnmounted(() => {
  if (eventSource.value) eventSource.value.close()
  if (reconnectTimer.value) clearTimeout(reconnectTimer.value)
})

onMounted(async () => {
  try {
    const [result, logResult] = await Promise.all([
      $fetch(`/api/tasks/${taskId}`),
      $fetch(`/api/tasks/${taskId}/logs`).catch(() => ({ logs: [] }))
    ])
    const initialTask = result?.task
    const historyLogs = (logResult as any)?.logs || []

    if (initialTask) {
      task.value = {
        ...task.value,
        step: initialTask.status,
        progress: initialTask.progress || 0,
        completedChunks: initialTask.completedChunks || 0,
        totalChunks: initialTask.totalChunks || 0,
        error: initialTask.error || null,
        model: initialTask.model,
        targetLanguage: initialTask.targetLanguage,
        filePath: initialTask.filePath || '',
        rootName: initialTask.rootName || ''
      }
    }

    if (historyLogs.length > 0) {
      resetLogs(historyLogs.map((log: any) => ({
        type: log.level === 'error' ? 'error' : 'info',
        category: log.category || undefined,
        message: log.message,
        timestamp: formatTime(log.createdAt)
      })))
    } else if (initialTask?.status === 'error' && initialTask.error) {
      resetLogs([{ type: 'error', message: `任务失败: ${initialTask.error}`, timestamp: formatClock(), category: 'error' }])
      task.value.currentText = null
      connectionState.value = 'history-only'
    } else if (initialTask?.status === 'done') {
      task.value.currentText = null
      connectionState.value = 'history-only'
    }
  } catch (e) {
    console.warn('[Task] Unable to fetch initial task state', e)
  }

  if (task.value.step === 'done' || task.value.step === 'error' || task.value.step === 'review') {
    connectionState.value = 'history-only'
    return
  }

  let reconnectAttempts = 0
  const MAX_RECONNECT_ATTEMPTS = 10
  const BASE_RECONNECT_DELAY = 1000
  let lastLoggedStep = task.value.step || null
  let isIntentionalClose = false

  function connectSSE() {
    connectionState.value = reconnectAttempts > 0 ? 'reconnecting' : 'connecting'
    const es = new EventSource(`/api/sse/progress?taskId=${taskId}`)
    eventSource.value = es

    const handleTerminalEvent = (raw: MessageEvent, terminalStep: 'done' | 'error') => {
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

      if (data.step === 'done' || data.step === 'error' || data.step === 'review') {
        isIntentionalClose = true
        if (reconnectTimer.value) {
          clearTimeout(reconnectTimer.value)
          reconnectTimer.value = null
        }
        es.close()
      }

      if (data.step && data.step !== lastLoggedStep) {
        lastLoggedStep = data.step
        if (!data.log) {
          const stepNames = {
            queued: '入队',
            extracting: '提取字幕',
            parsing: '解析文本',
            translating: 'AI 翻译',
            exporting: '导出文件',
            review: '字幕核对',
            done: '完成',
            error: '出错'
          }
          const currentStepName = stepNames[data.step] || data.step
          appendLog({
            type: data.step === 'error' ? 'error' : 'info',
            category: data.step === 'error' ? 'error' : 'system',
            message: data.step === 'error' ? '状态变更: 任务失败' : `状态变更: ${currentStepName}`,
            timestamp: formatClock()
          })
        }
      }

      if (data.log) {
        appendLog({
          type: data.step === 'error' || data.log.includes('!!!') ? 'error' : 'info',
          category: data.category || undefined,
          message: data.log,
          timestamp: formatClock()
        })
      }
    })

    es.addEventListener('done', (e) => handleTerminalEvent(e as MessageEvent, 'done'))
    es.addEventListener('error', (e) => handleTerminalEvent(e as MessageEvent, 'error'))

    es.onerror = () => {
      es.close()
      if (isIntentionalClose) return
      if (task.value.step === 'done' || task.value.step === 'error' || task.value.step === 'review') {
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
