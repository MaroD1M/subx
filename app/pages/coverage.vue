<template>
  <AppContainer size="wide" class="space-y-5 pb-4">
    <PageHeader
      title="覆盖检查"
      description="检查媒体库中视频的目标语言字幕覆盖情况，并批量补齐缺失字幕。"
      :breadcrumb="[{ label: '首页', icon: 'i-lucide-home', to: '/' }, { label: '覆盖检查', icon: 'i-lucide-list-checks' }]"
    >
      <template #actions>
        <UButton
          label="刷新覆盖"
          icon="i-lucide-refresh-cw"
          size="sm"
          color="primary"
          variant="soft"
          :loading="loading"
          :disabled="!mediaRoots.length"
          @click="loadCoverage(true)"
        />
      </template>
    </PageHeader>

    <div v-if="!mediaRoots.length" class="rounded-3xl border border-dashed border-gray-300 bg-white/70 p-8 text-center dark:border-gray-700 dark:bg-gray-950/40">
      <UIcon name="i-lucide-library-big" class="mx-auto h-8 w-8 text-gray-300 dark:text-gray-600" />
      <p class="mt-3 text-sm font-medium text-gray-700 dark:text-gray-200">还没有可检查的媒体库</p>
      <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">请先添加并启用至少一个媒体库，再回来检查字幕覆盖情况。</p>
      <UButton label="前往媒体库" icon="i-lucide-library-big" color="primary" variant="soft" class="mt-4" to="/media-libraries" />
    </div>

    <template v-else>
      <div class="surface-card space-y-3 p-3 sm:p-4">
        <div class="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <UFormField label="媒体库" class="w-full sm:max-w-sm">
            <USelect v-model="selectedRootId" :items="rootItems" class="w-full" aria-label="选择媒体库" />
          </UFormField>
          <div class="flex flex-wrap items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
            <label class="flex items-center gap-2 rounded-lg border border-gray-200/80 bg-white/70 px-2.5 py-1.5 dark:border-gray-700/70 dark:bg-gray-950/30">
              <span class="whitespace-nowrap text-gray-600 dark:text-gray-300">包含内嵌字幕</span>
              <USwitch v-model="includeEmbedded" aria-label="包含内嵌字幕" />
            </label>
            <UBadge color="neutral" variant="subtle">目标语言 {{ targetLanguageLabel(activeTargetLanguage) }}</UBadge>
            <UBadge v-if="coverage" color="neutral" variant="subtle">扫描 {{ coverage.scanned }} 个文件</UBadge>
            <UBadge v-if="coverage?.cachedAt" color="neutral" variant="subtle">缓存 {{ formatDate(coverage.cachedAt) }}</UBadge>
            <UBadge v-if="coverage && !coverage.truncated" color="success" variant="subtle">结果完整</UBadge>
          </div>
        </div>
        <p class="text-xs leading-5 text-gray-500 dark:text-gray-400">
          缺失表示该视频还没有目标语言字幕；处理中、待核对和失败会关联当前翻译任务。勾选缺失文件后即可批量创建翻译任务。
        </p>
      </div>

      <div class="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        <div v-for="card in summaryCards" :key="card.key" class="surface-card min-w-0 p-3 sm:p-4">
          <div class="flex items-center justify-between gap-2">
            <p class="stat-label min-w-0 truncate">{{ card.label }}</p>
            <span class="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg" :class="card.iconClass">
              <UIcon :name="card.icon" class="h-4 w-4" />
            </span>
          </div>
          <p class="stat-value mt-1" :class="card.valueClass">{{ card.value }}</p>
        </div>
      </div>

      <div class="surface-card space-y-3 p-3 sm:p-4">
        <div class="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div class="flex flex-wrap gap-1.5" role="group" aria-label="状态筛选">
            <UButton
              v-for="tab in statusTabs"
              :key="tab.value"
              :label="`${tab.label} ${tab.count}`"
              size="xs"
              :color="statusFilter === tab.value ? 'primary' : 'neutral'"
              :variant="statusFilter === tab.value ? 'solid' : 'soft'"
              @click="statusFilter = tab.value"
            />
          </div>
          <div class="flex flex-wrap items-center gap-2">
            <UInput
              v-model="searchQuery"
              icon="i-lucide-search"
              size="sm"
              placeholder="搜索文件名、路径或系列"
              class="w-full sm:w-64"
              aria-label="搜索文件"
            />
            <UButton
              v-if="searchQuery || statusFilter !== 'all'"
              label="清空筛选"
              icon="i-lucide-filter-x"
              size="sm"
              color="neutral"
              variant="ghost"
              @click="clearFilters"
            />
          </div>
        </div>
        <div v-if="coverage?.truncated" class="rounded-xl border border-amber-200/70 bg-amber-50/80 px-3 py-2 text-xs leading-5 text-amber-700 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-300">
          扫描结果较多，当前只展示部分文件。请刷新重试，或缩小媒体库范围后再检查。
        </div>
      </div>

      <div v-if="error" class="surface-card space-y-3 border border-red-200/70 p-5 text-center dark:border-red-900/40">
        <UIcon name="i-lucide-circle-alert" class="mx-auto h-7 w-7 text-red-500" />
        <div>
          <p class="text-sm font-medium text-gray-800 dark:text-gray-100">加载覆盖情况失败</p>
          <p class="mt-1 break-all text-xs text-gray-500 dark:text-gray-400">{{ error }}</p>
        </div>
        <UButton label="重新加载" icon="i-lucide-refresh-cw" size="sm" color="primary" variant="soft" :loading="loading" @click="loadCoverage(true)" />
      </div>

      <div v-else-if="loading && !coverage" class="surface-card flex items-center justify-center gap-2 p-8 text-sm text-gray-500 dark:text-gray-400">
        <UIcon name="i-lucide-loader-2" class="h-4 w-4 animate-spin" />
        正在扫描媒体库覆盖情况...
      </div>

      <div v-else-if="!coverage" class="surface-card p-8 text-center text-sm text-gray-500 dark:text-gray-400">
        选择媒体库后将自动检查字幕覆盖情况。
      </div>

      <div v-else-if="!coverage.files.length" class="rounded-2xl border border-dashed border-gray-300 bg-white/70 p-8 text-center dark:border-gray-700 dark:bg-gray-950/40">
        <UIcon name="i-lucide-file-search" class="mx-auto h-7 w-7 text-gray-300 dark:text-gray-600" />
        <p class="mt-3 text-sm font-medium text-gray-700 dark:text-gray-200">当前媒体库未找到视频文件</p>
        <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">请确认路径挂载正确，或刷新后重试。</p>
      </div>

      <template v-else>
        <div v-if="missingFiles.length" class="surface-card flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between sm:p-4">
          <div class="flex flex-wrap items-center gap-2 text-xs text-gray-600 dark:text-gray-300">
            <UIcon name="i-lucide-mouse-pointer-click" class="h-4 w-4 shrink-0 text-orange-500" />
            <span>已选 <strong class="font-semibold text-gray-900 dark:text-white">{{ selectedMissingFiles.length }}</strong> / {{ missingFiles.length }} 个缺失文件</span>
            <UButton
              :label="allMissingSelected ? '取消全选缺失' : '全选缺失'"
              :icon="allMissingSelected ? 'i-lucide-square-x' : 'i-lucide-check-square'"
              size="xs"
              color="neutral"
              variant="soft"
              @click="toggleSelectAllMissing"
            />
            <UButton
              v-if="selectedMissingFiles.length"
              label="清空选择"
              icon="i-lucide-x"
              size="xs"
              color="neutral"
              variant="ghost"
              @click="clearSelection"
            />
          </div>
          <UButton
            label="翻译选中缺失"
            icon="i-lucide-languages"
            color="primary"
            size="sm"
            :loading="submitting"
            :disabled="!selectedMissingFiles.length || submitting"
            @click="translateSelectedMissing"
          />
        </div>

        <div v-if="!visibleGroups.length" class="surface-card space-y-2 p-8 text-center text-xs text-gray-500 dark:text-gray-400">
          <UIcon name="i-lucide-search-x" class="mx-auto h-6 w-6 text-gray-300 dark:text-gray-600" />
          <p>当前筛选下没有匹配的文件</p>
          <UButton label="清空筛选" size="xs" color="neutral" variant="soft" @click="clearFilters" />
        </div>

        <div v-else class="space-y-3">
          <section v-for="group in visibleGroups" :key="group.key" class="surface-card overflow-hidden">
            <div class="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 px-3 py-3 dark:border-gray-800 sm:px-4">
              <div class="min-w-0">
                <p class="break-all text-sm font-semibold text-gray-900 dark:text-white">{{ group.title }}</p>
                <p class="mt-0.5 text-[11px] text-gray-500 dark:text-gray-400">
                  {{ group.files.length }} 个文件<span v-if="group.missingCount"> · 缺失 {{ group.missingCount }} 个</span>
                </p>
              </div>
              <UBadge color="neutral" variant="subtle" size="sm">{{ group.files.length }}</UBadge>
            </div>

            <div class="divide-y divide-gray-100 dark:divide-gray-800">
              <div
                v-for="file in group.files"
                :key="fileKey(file)"
                class="flex flex-col gap-3 px-3 py-3 sm:flex-row sm:items-start sm:gap-4 sm:px-4"
              >
                <div class="flex min-w-0 flex-1 items-start gap-3">
                  <UCheckbox
                    v-if="file.status === 'missing'"
                    :model-value="isSelected(file)"
                    :aria-label="`选择缺失文件 ${file.name}`"
                    class="mt-0.5 shrink-0"
                    @update:model-value="toggleFileSelection(file)"
                  />
                  <UIcon
                    v-else
                    :name="statusMeta(file.status).icon"
                    class="mt-0.5 h-4 w-4 shrink-0"
                    :class="statusMeta(file.status).iconClass"
                  />

                  <div class="min-w-0 flex-1 space-y-1">
                    <div class="flex flex-wrap items-center gap-2">
                      <p class="min-w-0 break-all text-sm font-medium text-gray-800 dark:text-gray-100">{{ file.name }}</p>
                      <UBadge :color="statusMeta(file.status).color" variant="subtle" size="sm">{{ statusMeta(file.status).label }}</UBadge>
                    </div>
                    <p class="break-all font-mono text-[11px] leading-5 text-gray-500 dark:text-gray-400">{{ file.path }}</p>
                    <p v-if="file.subtitleSource || file.subtitlePath" class="flex min-w-0 items-start gap-1.5 text-[11px] leading-5 text-emerald-700 dark:text-emerald-300">
                      <UIcon
                        :name="file.subtitleSource === 'embedded' ? 'i-lucide-box' : 'i-lucide-file-check-2'"
                        class="mt-0.5 h-3.5 w-3.5 shrink-0"
                      />
                      <span class="min-w-0 break-all">{{ subtitleSourceLabel(file) }}</span>
                    </p>
                    <p v-if="file.updatedAt" class="text-[11px] text-gray-400 dark:text-gray-500">更新于 {{ formatDate(file.updatedAt) }}</p>
                  </div>
                </div>

                <div class="flex shrink-0 flex-wrap items-center gap-2 pl-7 sm:justify-end sm:pl-0">
                  <UButton
                    v-if="file.taskId"
                    label="查看任务"
                    icon="i-lucide-arrow-up-right"
                    size="xs"
                    color="neutral"
                    variant="soft"
                    :to="`/task/${file.taskId}`"
                  />
                </div>
              </div>
            </div>
          </section>
        </div>
      </template>
    </template>
  </AppContainer>
</template>

<script setup lang="ts">
import { LANGUAGE_OPTIONS } from '~~/shared/languages'
import { formatDateTime } from '~~/shared/time'

useHead({
  title: '覆盖检查 - SubX'
})

type CoverageStatus = 'done' | 'review' | 'processing' | 'failed' | 'missing'
type BadgeColor = 'primary' | 'success' | 'warning' | 'error' | 'neutral' | 'info'

interface CoverageFile {
  path: string
  name: string
  rootId: string
  seriesKey: string
  seriesTitle: string
  status: CoverageStatus
  targetLanguage: string
  taskId?: string
  taskStatus?: string
  subtitlePath?: string
  subtitleSource?: 'sidecar' | 'embedded'
  matchedLanguage?: string
  embeddedTrackTitle?: string
  updatedAt?: string
}

interface CoverageSeries {
  seriesKey: string
  seriesTitle: string
  files: CoverageFile[]
}

interface CoverageSummary {
  total: number
  done: number
  review: number
  processing: number
  failed: number
  missing: number
}

interface CoverageResponse {
  rootId: string
  rootName: string
  targetLanguage: string
  scanned: number
  truncated: boolean
  cachedAt?: string
  summary: CoverageSummary
  series: CoverageSeries[]
  files: CoverageFile[]
}

interface CoverageGroup {
  key: string
  title: string
  files: CoverageFile[]
  missingCount: number
}

const STATUS_META: Record<CoverageStatus, { label: string, color: BadgeColor, icon: string, iconClass: string }> = {
  done: { label: '已完成', color: 'success', icon: 'i-lucide-circle-check', iconClass: 'text-emerald-600 dark:text-emerald-400' },
  review: { label: '待核对', color: 'warning', icon: 'i-lucide-list-checks', iconClass: 'text-amber-600 dark:text-amber-400' },
  processing: { label: '处理中', color: 'primary', icon: 'i-lucide-loader-2', iconClass: 'text-sky-600 dark:text-sky-400' },
  failed: { label: '失败', color: 'error', icon: 'i-lucide-circle-x', iconClass: 'text-red-600 dark:text-red-400' },
  missing: { label: '缺失', color: 'error', icon: 'i-lucide-circle-dashed', iconClass: 'text-orange-600 dark:text-orange-400' }
}

const toast = useToast()
const { confirm } = useConfirm()
const timeZone = useTimeZone()
const { data: configData } = await useAppConfigData()

const config = computed<any>(() => configData.value || {})
const mediaRoots = computed<any[]>(() => {
  const roots = Array.isArray(config.value?.mediaRoots) ? config.value.mediaRoots : []
  return roots.filter((root: any) => root?.enabled !== false && root?.id)
})
const rootItems = computed(() => mediaRoots.value.map((root: any) => ({
  label: root.name || root.path || String(root.id),
  value: String(root.id)
})))

const selectedRootId = ref('')
const targetLanguage = computed(() => String(config.value?.targetLanguage || 'zh-CN'))

const coverage = ref<CoverageResponse | null>(null)
const activeTargetLanguage = computed(() => coverage.value?.targetLanguage || targetLanguage.value)
const loading = ref(false)
const submitting = ref(false)
const includeEmbedded = ref(true)
const error = ref('')
const statusFilter = ref<'all' | CoverageStatus>('all')
const searchQuery = ref('')
const selectedKeys = ref<Set<string>>(new Set())
let readyForCoverage = false
let requestSerial = 0

watch(mediaRoots, (roots) => {
  if (!roots.length) return
  if (!roots.some((root: any) => String(root.id) === selectedRootId.value)) {
    selectedRootId.value = String(roots[0]!.id)
  }
}, { immediate: true })

watch(selectedRootId, () => {
  clearSelection()
  coverage.value = null
  error.value = ''
  if (!readyForCoverage) return
  if (selectedRootId.value) void loadCoverage()
})

watch(includeEmbedded, () => {
  if (!readyForCoverage) return
  void loadCoverage(true)
})

onMounted(() => {
  readyForCoverage = true
  if (selectedRootId.value) void loadCoverage()
})

const summary = computed<CoverageSummary>(() => coverage.value?.summary || {
  total: 0,
  done: 0,
  review: 0,
  processing: 0,
  failed: 0,
  missing: 0
})

const summaryCards = computed(() => [
  {
    key: 'total',
    label: '文件总数',
    value: summary.value.total,
    icon: 'i-lucide-files',
    valueClass: 'text-gray-900 dark:text-white',
    iconClass: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300'
  },
  {
    key: 'missing',
    label: '缺失',
    value: summary.value.missing,
    icon: 'i-lucide-circle-dashed',
    valueClass: 'text-orange-600 dark:text-orange-400',
    iconClass: 'bg-orange-50 text-orange-600 dark:bg-orange-950/30 dark:text-orange-400'
  },
  {
    key: 'review',
    label: '待核对',
    value: summary.value.review,
    icon: 'i-lucide-list-checks',
    valueClass: 'text-amber-600 dark:text-amber-400',
    iconClass: 'bg-amber-50 text-amber-600 dark:bg-amber-950/30 dark:text-amber-400'
  },
  {
    key: 'processing',
    label: '处理中',
    value: summary.value.processing,
    icon: 'i-lucide-loader-2',
    valueClass: 'text-sky-600 dark:text-sky-400',
    iconClass: 'bg-sky-50 text-sky-600 dark:bg-sky-950/30 dark:text-sky-400'
  },
  {
    key: 'failed',
    label: '失败',
    value: summary.value.failed,
    icon: 'i-lucide-circle-x',
    valueClass: 'text-red-600 dark:text-red-400',
    iconClass: 'bg-red-50 text-red-600 dark:bg-red-950/30 dark:text-red-400'
  },
  {
    key: 'done',
    label: '已完成',
    value: summary.value.done,
    icon: 'i-lucide-circle-check',
    valueClass: 'text-emerald-600 dark:text-emerald-400',
    iconClass: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/30 dark:text-emerald-400'
  }
])

const statusTabs = computed(() => [
  { value: 'all' as const, label: '全部', count: summary.value.total },
  { value: 'missing' as const, label: '缺失', count: summary.value.missing },
  { value: 'review' as const, label: '待核对', count: summary.value.review },
  { value: 'processing' as const, label: '处理中', count: summary.value.processing },
  { value: 'failed' as const, label: '失败', count: summary.value.failed },
  { value: 'done' as const, label: '已完成', count: summary.value.done }
])

const seriesTitles = computed(() => {
  const map = new Map<string, string>()
  for (const series of coverage.value?.series || []) {
    if (series.seriesKey) map.set(series.seriesKey, series.seriesTitle || series.seriesKey)
  }
  return map
})

const filteredFiles = computed(() => {
  const keyword = searchQuery.value.trim().toLowerCase()
  return (coverage.value?.files || []).filter((file) => {
    if (statusFilter.value !== 'all' && file.status !== statusFilter.value) return false
    if (!keyword) return true
    const seriesTitle = file.seriesTitle || seriesTitles.value.get(file.seriesKey) || ''
    const haystack = `${file.name || ''} ${file.path || ''} ${seriesTitle} ${file.seriesKey || ''}`.toLowerCase()
    return haystack.includes(keyword)
  })
})

const visibleGroups = computed<CoverageGroup[]>(() => {
  const groups = new Map<string, CoverageGroup>()
  for (const file of filteredFiles.value) {
    const key = file.seriesKey || '__ungrouped__'
    let group = groups.get(key)
    if (!group) {
      const title = seriesTitles.value.get(key) || file.seriesTitle || file.seriesKey || '未分组文件'
      group = { key, title, files: [], missingCount: 0 }
      groups.set(key, group)
    }
    group.files.push(file)
    if (file.status === 'missing') group.missingCount += 1
  }
  return Array.from(groups.values())
})

const missingFiles = computed(() => (coverage.value?.files || []).filter(file => file.status === 'missing'))
const selectedMissingFiles = computed(() => missingFiles.value.filter(file => selectedKeys.value.has(fileKey(file))))
const allMissingSelected = computed(() => missingFiles.value.length > 0 && selectedMissingFiles.value.length === missingFiles.value.length)

function fileKey(file: CoverageFile) {
  return `${file.rootId || selectedRootId.value}:${file.path}`
}

function statusMeta(status: CoverageStatus) {
  return STATUS_META[status] || STATUS_META.missing
}

function targetLanguageLabel(value: string) {
  return LANGUAGE_OPTIONS.find(option => option.value === value)?.label || value || '自动'
}

function subtitleSourceLabel(file: CoverageFile) {
  if (file.subtitleSource === 'embedded') {
    const language = file.matchedLanguage || file.targetLanguage || ''
    const title = file.embeddedTrackTitle && file.embeddedTrackTitle !== language
      ? ` · ${file.embeddedTrackTitle}`
      : ''
    return `内嵌 ${language}${title}`.trim()
  }
  return file.subtitlePath ? `外挂 ${file.subtitlePath}` : ''
}

function formatDate(value: unknown) {
  return formatDateTime(value, timeZone)
}

function clearFilters() {
  statusFilter.value = 'all'
  searchQuery.value = ''
}

function clearSelection() {
  selectedKeys.value = new Set()
}

function isSelected(file: CoverageFile) {
  return selectedKeys.value.has(fileKey(file))
}

function toggleFileSelection(file: CoverageFile) {
  const next = new Set(selectedKeys.value)
  const key = fileKey(file)
  if (next.has(key)) next.delete(key)
  else next.add(key)
  selectedKeys.value = next
}

function toggleSelectAllMissing() {
  if (allMissingSelected.value) {
    clearSelection()
    return
  }
  selectedKeys.value = new Set(missingFiles.value.map(file => fileKey(file)))
}

function pruneSelection() {
  const available = new Set(missingFiles.value.map(file => fileKey(file)))
  const next = new Set<string>()
  for (const key of selectedKeys.value) {
    if (available.has(key)) next.add(key)
  }
  selectedKeys.value = next
}

async function loadCoverage(forceRefresh = false) {
  if (!selectedRootId.value) return
  const serial = ++requestSerial
  loading.value = true
  error.value = ''
  try {
    const query: Record<string, string> = {
      rootId: selectedRootId.value,
      targetLanguage: targetLanguage.value,
      includeEmbedded: includeEmbedded.value ? '1' : '0'
    }
    if (forceRefresh) query.refresh = '1'
    const result = await $fetch<CoverageResponse>('/api/library/coverage', { query })
    if (serial !== requestSerial) return
    coverage.value = result
    pruneSelection()
  } catch (e: any) {
    if (serial !== requestSerial) return
    coverage.value = null
    error.value = e?.data?.message || e?.message || '无法加载覆盖情况'
    toast.add({ title: '加载失败', description: error.value, color: 'error' })
  } finally {
    if (serial === requestSerial) loading.value = false
  }
}

async function translateSelectedMissing() {
  if (!selectedMissingFiles.value.length || submitting.value) return
  const current = coverage.value
  if (!current) return
  if (selectedMissingFiles.value.length > 50) {
    const proceed = await confirm({
      title: `创建 ${selectedMissingFiles.value.length} 个翻译任务？`,
      description: '任务会按当前并发设置逐步处理，低功耗 NAS 建议先确认任务数和磁盘空间。',
      confirmLabel: '继续创建',
      cancelLabel: '再检查一下',
      color: 'warning'
    })
    if (!proceed) return
  }

  submitting.value = true
  try {
    const result = await $fetch<{ taskIds?: string[], taskId?: string }>('/api/task', {
      method: 'POST',
      body: {
        files: selectedMissingFiles.value.map(file => ({ path: file.path, rootId: file.rootId })),
        targetLanguage: current.targetLanguage,
        outputMode: config.value?.outputMode,
        subtitleFormat: config.value?.subtitleFormat,
        stylePreset: config.value?.stylePreset,
        subtitleStylePreset: config.value?.subtitleStylePreset,
        subtitleStyle: config.value?.subtitleStyle,
        bilingualLayout: config.value?.bilingualLayout
      }
    })
    const taskCount = Array.isArray(result?.taskIds) && result.taskIds.length
      ? result.taskIds.length
      : (result?.taskId ? 1 : selectedMissingFiles.value.length)
    toast.add({ title: '已创建翻译任务', description: `已为 ${taskCount} 个缺失文件创建任务`, color: 'success' })
    clearSelection()
    await loadCoverage(true)
  } catch (e: any) {
    toast.add({ title: '创建任务失败', description: e?.data?.message || e?.message || '无法创建翻译任务', color: 'error' })
  } finally {
    submitting.value = false
  }
}
</script>
