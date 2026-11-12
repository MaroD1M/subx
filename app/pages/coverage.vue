<template>
  <AppContainer size="wide" class="app-page-stack pb-4">
    <PageHeader
      title="覆盖检查"
      description="检查媒体库中视频的目标语言字幕覆盖情况，并批量补齐缺失字幕。"
      :breadcrumb="[{ label: '首页', icon: 'i-lucide-home', to: '/' }, { label: '覆盖检查', icon: 'i-lucide-list-checks' }]"
    >
      <p class="app-caption">
        扫描覆盖会读取媒体库并探测内嵌字幕，大型媒体库可能需要较长时间。
      </p>
      <template #actions>
        <UButton
          :label="coverage?.hasCache ? '重新扫描' : '扫描覆盖'"
          :icon="coverage?.hasCache ? 'i-lucide-refresh-cw' : 'i-lucide-scan-search'"
          size="sm"
          color="primary"
          variant="solid"
          :loading="scanning"
          :disabled="!mediaRoots.length || !selectedRootId || scanning"
          @click="scanCoverage"
        />
      </template>
    </PageHeader>

    <div v-if="!mediaRoots.length" class="app-empty space-y-3">
      <UIcon name="i-lucide-library-big" class="mx-auto h-8 w-8 text-gray-300 dark:text-gray-600" />
      <p class="text-sm font-medium text-gray-700 dark:text-gray-200">还没有可检查的媒体库</p>
      <p class="app-caption">请先添加并启用至少一个媒体库，再回来检查字幕覆盖情况。</p>
      <UButton label="前往媒体库" icon="i-lucide-library-big" color="primary" variant="soft" class="mt-1" to="/media-libraries" />
    </div>

    <template v-else>
      <div class="app-toolbar-card items-stretch">
        <div class="app-toolbar">
          <div class="flex flex-col gap-3 sm:flex-row sm:items-end">
            <UFormField label="媒体库" class="w-full sm:max-w-sm">
              <USelect v-model="selectedRootId" :items="rootItems" class="w-full" aria-label="选择媒体库" />
            </UFormField>
            <label class="app-field-row w-full justify-between gap-3 sm:w-auto">
              <span class="whitespace-nowrap text-xs font-medium text-gray-600 dark:text-gray-300">包含内嵌字幕</span>
              <USwitch v-model="includeEmbedded" aria-label="包含内嵌字幕" />
            </label>
          </div>
          <div class="flex flex-wrap items-center gap-1.5">
            <span class="app-pill app-pill-neutral">目标语言 {{ targetLanguageLabel(activeTargetLanguage) }}</span>
            <template v-if="coverage?.hasCache">
              <span class="app-pill app-pill-info">扫描 {{ coverage.scanned }} 个文件</span>
              <span class="app-pill" :class="cacheStale ? 'app-pill-warning' : 'app-pill-success'">{{ cacheStale ? '缓存可能过期' : '缓存有效' }}</span>
              <span class="app-pill" :class="coverage.truncated ? 'app-pill-warning' : 'app-pill-success'">{{ coverage.truncated ? '结果截断' : '结果完整' }}</span>
            </template>
            <span v-else class="app-pill app-pill-warning">尚未扫描</span>
            <span v-if="loading" class="app-meta inline-flex items-center gap-1.5">
              <UIcon name="i-lucide-loader-2" class="h-3.5 w-3.5 animate-spin" />
              正在读取缓存…
            </span>
          </div>
        </div>

        <div class="app-stat-grid">
          <div class="app-stat">
            <p class="app-stat-label">扫描文件</p>
            <p class="app-stat-value text-base">{{ coverage?.hasCache ? coverage.scanned : '—' }}</p>
          </div>
          <div class="app-stat">
            <p class="app-stat-label">缺失文件</p>
            <p class="app-stat-value text-base" :class="coverage?.hasCache && summary.missing ? 'text-orange-600 dark:text-orange-400' : ''">
              {{ coverage?.hasCache ? summary.missing : '—' }}
            </p>
          </div>
          <div class="app-stat">
            <p class="app-stat-label">已完成</p>
            <p class="app-stat-value text-base">{{ coverage?.hasCache ? summary.done : '—' }}</p>
          </div>
          <div class="app-stat">
            <p class="app-stat-label">缓存时间</p>
            <p class="mt-0.5 truncate text-xs font-semibold text-gray-700 dark:text-gray-200">{{ coverage?.cachedAt ? formatDate(coverage.cachedAt) : '尚未扫描' }}</p>
            <p v-if="coverage?.hasCache" class="app-meta">{{ cacheStale ? '建议重新扫描' : '缓存较新' }}</p>
          </div>
        </div>

        <p class="app-caption">
          缺失表示该视频还没有目标语言字幕；处理中、待核对和失败会关联当前翻译任务。勾选缺失文件后即可批量创建翻译任务。
        </p>
        <div v-if="coverage?.hasCache" class="app-info-banner app-info-warning">
          <UIcon name="i-lucide-info" class="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>结果来自缓存，媒体库变动后请重新扫描。</span>
        </div>
      </div>

      <CoverageHealthCard
        v-if="coverage?.hasCache"
        :summary="summary"
        :active-status="statusFilter"
        @select="statusFilter = statusFilter === $event ? 'all' : $event"
      />

      <CoverageAutoFillPanel
        v-model:root-id="selectedRootId"
        :roots="mediaRoots"
        :target-language="targetLanguage"
        @completed="loadCoverage()"
      />

      <div v-if="error && coverage" class="app-info-banner app-info-error flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div class="flex min-w-0 items-start gap-2">
          <UIcon name="i-lucide-circle-alert" class="mt-0.5 h-4 w-4 shrink-0" />
          <div class="min-w-0">
            <p class="font-medium">覆盖操作失败</p>
            <p class="mt-0.5 break-all opacity-80">{{ error }}</p>
          </div>
        </div>
        <div class="flex shrink-0 flex-wrap gap-2">
          <UButton label="重新加载缓存" icon="i-lucide-refresh-cw" size="sm" color="neutral" variant="soft" :loading="loading" @click="loadCoverage" />
          <UButton label="重试扫描" icon="i-lucide-scan-search" size="sm" color="primary" variant="soft" :loading="scanning" @click="scanCoverage" />
        </div>
      </div>

      <div v-if="error && !coverage" class="app-empty space-y-3 border-red-200/70 dark:border-red-900/40">
        <UIcon name="i-lucide-circle-alert" class="mx-auto h-7 w-7 text-red-500" />
        <p class="text-sm font-medium text-gray-800 dark:text-gray-100">加载覆盖情况失败</p>
        <p class="app-caption break-all">{{ error }}</p>
        <div class="flex flex-wrap justify-center gap-2">
          <UButton label="重新加载缓存" icon="i-lucide-refresh-cw" size="sm" color="neutral" variant="soft" :loading="loading" @click="loadCoverage" />
          <UButton label="扫描覆盖" icon="i-lucide-scan-search" size="sm" color="primary" variant="soft" :loading="scanning" @click="scanCoverage" />
        </div>
      </div>

      <div v-else-if="loading && !coverage" class="app-toolbar-card items-center justify-center">
        <span class="app-meta inline-flex items-center gap-2">
          <UIcon name="i-lucide-loader-2" class="h-4 w-4 animate-spin" />
          正在读取覆盖缓存...
        </span>
      </div>

      <div v-else-if="!coverage?.hasCache" class="app-empty space-y-3">
        <UIcon name="i-lucide-scan-search" class="mx-auto h-8 w-8 text-gray-300 dark:text-gray-600" />
        <p class="text-sm font-medium text-gray-700 dark:text-gray-200">尚未扫描当前媒体库</p>
        <p class="app-caption">点击扫描后会读取媒体库并探测内嵌字幕，生成字幕覆盖结果。</p>
        <UButton
          label="扫描覆盖"
          icon="i-lucide-scan-search"
          color="primary"
          variant="solid"
          class="mt-1"
          :loading="scanning"
          :disabled="scanning"
          @click="scanCoverage"
        />
      </div>

      <template v-else>
        <section class="app-section space-y-3 p-3 sm:p-4">
          <div class="app-toolbar">
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
          <div v-if="coverage?.truncated" class="app-info-banner app-info-warning">
            扫描结果较多，当前只展示部分文件。请重新扫描重试，或缩小媒体库范围后再检查。
          </div>
        </section>

        <div v-if="!coverage.files.length" class="app-empty space-y-2">
          <UIcon name="i-lucide-file-search" class="mx-auto h-7 w-7 text-gray-300 dark:text-gray-600" />
          <p class="text-sm font-medium text-gray-700 dark:text-gray-200">当前媒体库未找到视频文件</p>
          <p class="app-caption">请确认路径挂载正确，或重新扫描后重试。</p>
        </div>

        <template v-else>
          <div v-if="missingFiles.length" class="app-toolbar-card">
            <div class="flex flex-wrap items-center gap-2">
              <UIcon name="i-lucide-mouse-pointer-click" class="h-4 w-4 shrink-0 text-orange-500" />
              <span class="app-pill app-pill-primary">已选 {{ selectedMissingFiles.length }} / {{ missingFiles.length }}</span>
              <span class="app-meta">个缺失文件</span>
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
              variant="solid"
              size="sm"
              :loading="submitting"
              :disabled="!selectedMissingFiles.length || submitting"
              @click="translateSelectedMissing"
            />
          </div>

          <div v-if="!visibleGroups.length" class="app-empty space-y-2">
            <UIcon name="i-lucide-search-x" class="mx-auto h-6 w-6 text-gray-300 dark:text-gray-600" />
            <p class="app-caption">当前筛选下没有匹配的文件</p>
            <UButton label="清空筛选" size="xs" color="neutral" variant="soft" @click="clearFilters" />
          </div>

          <div v-else class="space-y-2">
            <section v-for="group in visibleGroups" :key="group.key" class="app-section overflow-hidden p-0 sm:p-0">
              <button
                type="button"
                class="flex w-full items-center gap-2.5 px-3 py-2.5 text-left transition-colors hover:bg-gray-50/80 dark:hover:bg-gray-900/40 sm:px-4"
                :aria-expanded="isGroupExpanded(group.key)"
                @click="toggleGroup(group.key)"
              >
                <UIcon
                  :name="isGroupExpanded(group.key) ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'"
                  class="h-4 w-4 shrink-0 text-gray-400 dark:text-gray-500"
                />
                <div class="min-w-0 flex-1">
                  <div class="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <p class="min-w-0 break-all text-sm font-semibold text-gray-900 dark:text-white">{{ group.title }}</p>
                    <span class="app-meta">{{ group.files.length }} 个文件</span>
                    <span v-if="group.missingCount" class="app-pill app-pill-error">缺失 {{ group.missingCount }}</span>
                    <span v-if="group.reviewCount" class="app-pill app-pill-warning">待核对 {{ group.reviewCount }}</span>
                    <span v-if="group.failedCount" class="app-pill app-pill-error">失败 {{ group.failedCount }}</span>
                  </div>
                  <div class="mt-1 flex items-center gap-2">
                    <div class="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800 sm:max-w-48">
                      <div class="h-full rounded-full bg-emerald-500 transition-all" :style="{ width: `${groupCompletionRate(group)}%` }" />
                    </div>
                    <span class="app-meta shrink-0 tabular-nums">完成 {{ group.doneCount }}/{{ group.files.length }}</span>
                  </div>
                </div>
              </button>

              <div v-if="isGroupExpanded(group.key)" class="divide-y divide-gray-100 dark:divide-gray-800">
                <div
                  v-for="file in group.files"
                  :key="fileKey(file)"
                  class="flex flex-col gap-2 px-3 py-2 sm:flex-row sm:items-start sm:gap-3 sm:px-4"
                >
                  <div class="flex min-w-0 flex-1 items-start gap-2.5">
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

                    <div class="min-w-0 flex-1 space-y-0.5">
                      <div class="flex flex-wrap items-center gap-1.5">
                        <p class="min-w-0 break-all text-sm font-medium text-gray-800 dark:text-gray-100">{{ file.name }}</p>
                        <span class="app-pill" :class="statusPillClass(file.status)">{{ statusMeta(file.status).label }}</span>
                      </div>
                      <p class="app-meta break-all font-mono">{{ file.path }}</p>
                      <p v-if="file.subtitleSource || file.subtitlePath" class="flex min-w-0 items-start gap-1.5 text-xs leading-5 text-emerald-700 dark:text-emerald-300">
                        <UIcon
                          :name="file.subtitleSource === 'embedded' ? 'i-lucide-box' : 'i-lucide-file-check-2'"
                          class="mt-0.5 h-3.5 w-3.5 shrink-0"
                        />
                        <span class="min-w-0 break-all">{{ subtitleSourceLabel(file) }}</span>
                      </p>
                      <p v-if="file.updatedAt" class="app-meta">更新于 {{ formatDate(file.updatedAt) }}</p>
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
  includeEmbedded?: boolean
  scanned: number
  truncated: boolean
  cachedAt?: string | null
  hasCache: boolean
  summary: CoverageSummary
  series: CoverageSeries[]
  files: CoverageFile[]
}

interface CoverageGroup {
  key: string
  title: string
  files: CoverageFile[]
  missingCount: number
  reviewCount: number
  failedCount: number
  doneCount: number
  processingCount: number
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
const cacheStale = computed(() => {
  if (!coverage.value?.hasCache || !coverage.value.cachedAt) return false
  const cachedAt = new Date(coverage.value.cachedAt).getTime()
  if (!Number.isFinite(cachedAt)) return false
  return Date.now() - cachedAt > 24 * 60 * 60 * 1000
})
const loading = ref(false)
const scanning = ref(false)
const submitting = ref(false)
const includeEmbedded = ref(true)
const error = ref('')
const statusFilter = ref<'all' | CoverageStatus>('all')
const searchQuery = ref('')
const selectedKeys = ref<Set<string>>(new Set())
const expandedKeys = ref<Set<string>>(new Set())
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
  expandedKeys.value = new Set()
  coverage.value = null
  error.value = ''
  if (!readyForCoverage) return
  if (selectedRootId.value) void loadCoverage()
})

watch(includeEmbedded, () => {
  if (!readyForCoverage) return
  void loadCoverage()
})

watch([searchQuery, statusFilter], () => {
  if (!coverage.value?.hasCache) return
  if (!searchQuery.value.trim() && statusFilter.value === 'all') return
  const next = new Set(expandedKeys.value)
  for (const group of visibleGroups.value) next.add(group.key)
  expandedKeys.value = next
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
      group = {
        key,
        title,
        files: [],
        missingCount: 0,
        reviewCount: 0,
        failedCount: 0,
        doneCount: 0,
        processingCount: 0
      }
      groups.set(key, group)
    }
    group.files.push(file)
    if (file.status === 'missing') group.missingCount += 1
    else if (file.status === 'review') group.reviewCount += 1
    else if (file.status === 'failed') group.failedCount += 1
    else if (file.status === 'done') group.doneCount += 1
    else if (file.status === 'processing') group.processingCount += 1
  }
  return Array.from(groups.values()).sort((a, b) => {
    const priority = (group: CoverageGroup) => {
      if (group.missingCount > 0) return 0
      if (group.reviewCount > 0 || group.failedCount > 0) return 1
      if (group.processingCount > 0) return 2
      return 3
    }
    const diff = priority(a) - priority(b)
    return diff || a.title.localeCompare(b.title, 'zh-CN')
  })
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

function statusPillClass(status: CoverageStatus) {
  if (status === 'done') return 'app-pill-success'
  if (status === 'review') return 'app-pill-warning'
  if (status === 'processing') return 'app-pill-info'
  if (status === 'failed') return 'app-pill-error'
  if (status === 'missing') return 'app-pill-missing'
  return 'app-pill-neutral'
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

function groupCompletionRate(group: CoverageGroup) {
  return group.files.length ? Math.round((group.doneCount / group.files.length) * 100) : 0
}

function clearFilters() {
  statusFilter.value = 'all'
  searchQuery.value = ''
}

function clearSelection() {
  selectedKeys.value = new Set()
}

function isGroupExpanded(key: string) {
  return expandedKeys.value.has(key)
}

function toggleGroup(key: string) {
  const next = new Set(expandedKeys.value)
  if (next.has(key)) next.delete(key)
  else next.add(key)
  expandedKeys.value = next
}

function resetGroupExpansion() {
  const next = new Set<string>()
  for (const group of visibleGroups.value) {
    if (group.missingCount > 0) next.add(group.key)
  }
  if (searchQuery.value.trim() || statusFilter.value !== 'all') {
    for (const group of visibleGroups.value) next.add(group.key)
  }
  expandedKeys.value = next
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

async function loadCoverage() {
  if (!selectedRootId.value) return
  const serial = ++requestSerial
  if (scanning.value) scanning.value = false
  loading.value = true
  error.value = ''
  try {
    const query: Record<string, string> = {
      rootId: selectedRootId.value,
      targetLanguage: targetLanguage.value,
      includeEmbedded: includeEmbedded.value ? '1' : '0'
    }
    const result = await $fetch<CoverageResponse>('/api/library/coverage', { query })
    if (serial !== requestSerial) return
    coverage.value = result
    pruneSelection()
    resetGroupExpansion()
  } catch (e: any) {
    if (serial !== requestSerial) return
    error.value = e?.data?.message || e?.message || '无法加载覆盖情况'
    toast.add({ title: '加载失败', description: error.value, color: 'error' })
  } finally {
    if (serial === requestSerial) loading.value = false
  }
}

async function scanCoverage() {
  if (!selectedRootId.value || scanning.value) return
  const serial = ++requestSerial
  if (loading.value) loading.value = false
  scanning.value = true
  error.value = ''
  try {
    const result = await $fetch<CoverageResponse>('/api/library/coverage/scan', {
      method: 'POST',
      body: {
        rootId: selectedRootId.value,
        targetLanguage: targetLanguage.value,
        includeEmbedded: includeEmbedded.value
      }
    })
    if (serial !== requestSerial) return
    coverage.value = result
    pruneSelection()
    resetGroupExpansion()
    const count = Number(result.scanned ?? result.summary?.total ?? result.files?.length ?? 0)
    toast.add({ title: '扫描完成', description: `共 ${count} 个文件`, color: 'success' })
  } catch (e: any) {
    if (serial !== requestSerial) return
    error.value = e?.data?.message || e?.message || '扫描覆盖失败'
    toast.add({ title: '扫描失败', description: error.value, color: 'error' })
  } finally {
    if (serial === requestSerial) scanning.value = false
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
    await loadCoverage()
  } catch (e: any) {
    toast.add({ title: '创建任务失败', description: e?.data?.message || e?.message || '无法创建翻译任务', color: 'error' })
  } finally {
    submitting.value = false
  }
}
</script>
