<template>
  <AppContainer size="default" class="app-page-stack pb-28">
    <PageHeader
      title="媒体库管理"
      description="管理首页可浏览的媒体目录。"
      :breadcrumb="[{ label: '首页', icon: 'i-lucide-home', to: '/' }, { label: '媒体库管理', icon: 'i-lucide-library-big', to: '/media-libraries' }]"
    >
      <template #actions>
        <UBadge v-if="isDirty" color="warning" variant="subtle">有未保存修改</UBadge>
        <UButton label="返回首页" variant="outline" icon="i-lucide-arrow-left" color="neutral" size="sm" to="/" />
      </template>
    </PageHeader>

    <div class="app-toolbar-card flex-col items-stretch gap-3">
      <div class="app-toolbar">
        <div class="grid w-full grid-cols-2 gap-2 sm:grid-cols-4 lg:max-w-xl">
          <div class="app-stat">
            <p class="app-stat-label">媒体库</p>
            <p class="app-stat-value">{{ mediaRoots.length }}</p>
          </div>
          <div class="app-stat">
            <p class="app-stat-label">已启用</p>
            <p class="app-stat-value">{{ enabledRootCount }}</p>
          </div>
          <div class="app-stat">
            <p class="app-stat-label">默认库</p>
            <p class="app-stat-value">{{ defaultRootCount }}</p>
          </div>
          <div class="app-stat">
            <p class="app-stat-label">异常</p>
            <p class="app-stat-value" :class="invalidRootCount ? 'text-red-600 dark:text-red-400' : ''">{{ invalidRootCount }}</p>
          </div>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <UButton label="新增媒体库" icon="i-lucide-plus" size="sm" color="primary" variant="soft" @click="addMediaRoot" />
          <UButton label="批量检测" icon="i-lucide-scan-search" size="sm" color="neutral" variant="ghost" :loading="batchInspecting" @click="inspectAllRoots()" />
          <UButton label="管理监控目录" icon="i-lucide-workflow" size="sm" color="neutral" variant="ghost" to="/automation?tab=folders" />
        </div>
      </div>

      <div v-if="mediaRoots.length" class="app-toolbar border-t border-gray-100 pt-3 dark:border-gray-800">
        <div class="flex flex-1 flex-wrap items-center gap-2">
          <UInput v-model="librarySearch" icon="i-lucide-search" size="sm" placeholder="搜索名称或路径" class="w-full sm:max-w-xs" aria-label="搜索媒体库" />
          <USelect v-model="libraryStatusFilter" :items="libraryStatusOptions" size="sm" class="w-full sm:w-40" aria-label="媒体库状态筛选" />
          <UButton
            v-if="librarySearch || libraryStatusFilter !== 'all'"
            icon="i-lucide-filter-x"
            size="sm"
            color="neutral"
            variant="ghost"
            aria-label="清空媒体库筛选"
            title="清空筛选"
            @click="clearLibraryFilters"
          />
        </div>
        <div class="app-toolbar-meta">
          <span v-if="mediaRoots.length > 1" class="app-meta hidden sm:inline">可拖动卡片排序</span>
          <span class="app-pill app-pill-neutral">显示 {{ filteredMediaRoots.length }} / {{ mediaRoots.length }}</span>
        </div>
      </div>

      <div class="app-toolbar-meta gap-3 border-t border-gray-100 pt-3 dark:border-gray-800">
        <div class="flex items-center gap-2 rounded-full border border-gray-200 px-2.5 py-1 dark:border-gray-700">
          <USwitch v-model="forceSaveInvalidRoots" color="primary" size="sm" aria-label="允许保存不可访问的媒体库" />
          <span>允许保存不可访问的媒体库</span>
        </div>
        <span class="app-caption">路径填写容器内路径，保存前建议先检测。自动监控请在「自动化 → 监控目录」中配置。</span>
      </div>
    </div>

    <div v-if="mediaRoots.length" class="space-y-4">
      <div class="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        <button
          v-for="root in filteredMediaRoots"
          :key="root.id"
          data-testid="media-root-card"
          type="button"
          draggable="true"
          class="app-card group flex min-h-[164px] flex-col p-4 text-left transition-all hover:-translate-y-0.5 hover:border-primary-200 hover:shadow-md dark:hover:border-primary-900/50"
          :class="[
            rootValidation(root).length || inspectionStates[root.id]?.ok === false
              ? 'border-red-200 dark:border-red-900/40'
              : 'border-gray-200/80 dark:border-gray-800',
            draggingRootId === root.id ? 'opacity-50' : '',
            dragOverRootId === root.id && draggingRootId !== root.id ? 'border-primary-400 ring-2 ring-primary-200 dark:border-primary-600 dark:ring-primary-900/60' : ''
          ]"
          @click="selectRoot(root.id)"
          @dragstart="startRootDrag(root, $event)"
          @dragover.prevent="dragOverRootId = root.id"
          @dragleave="dragOverRootId = dragOverRootId === root.id ? '' : dragOverRootId"
          @drop.prevent="dropRoot(root)"
          @dragend="endRootDrag"
        >
          <div class="flex items-start justify-between gap-3">
            <div class="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-50 text-primary-700 dark:bg-primary-950/30 dark:text-primary-300">
              <UIcon name="i-lucide-library-big" class="h-5 w-5" />
            </div>
            <div class="flex items-center gap-1">
              <UIcon name="i-lucide-grip-vertical" class="h-4 w-4 cursor-grab text-gray-400 opacity-0 transition-opacity group-hover:opacity-100" aria-hidden="true" />
              <UIcon :name="statusIcon(root)" class="mt-0.5 h-4 w-4 shrink-0" :class="statusIconClass(root)" />
            </div>
          </div>
          <p class="mt-3 truncate text-sm font-semibold text-gray-900 dark:text-white">{{ root.name || '未命名媒体库' }}</p>
          <p class="app-caption mt-1 line-clamp-2 break-all font-mono" :title="root.path">{{ root.path || '未配置路径' }}</p>
          <div class="mt-auto flex flex-wrap items-center gap-1.5 pt-3">
            <span v-if="root.isDefault" class="app-pill app-pill-primary">默认</span>
            <span class="app-pill" :class="root.enabled !== false ? 'app-pill-success' : 'app-pill-neutral'">{{ root.enabled !== false ? '已启用' : '已停用' }}</span>
            <span v-if="rootValidation(root).length" class="app-pill app-pill-error">配置异常</span>
            <span class="app-pill app-pill-neutral ml-auto">#{{ rootPosition(root) }}</span>
          </div>
        </button>
      </div>

      <div v-if="!filteredMediaRoots.length" class="app-empty space-y-2">
        <UIcon name="i-lucide-search-x" class="mx-auto h-5 w-5 text-gray-300 dark:text-gray-600" />
        <p class="app-caption">没有匹配的媒体库</p>
        <UButton label="清空筛选" size="xs" color="neutral" variant="soft" @click="clearLibraryFilters" />
      </div>
    </div>

    <div v-else class="app-empty space-y-2">
      <UIcon name="i-lucide-library-big" class="mx-auto h-8 w-8 text-gray-300 dark:text-gray-600" />
      <p class="text-sm font-medium text-gray-700 dark:text-gray-200">当前还没有媒体库</p>
      <p class="app-caption">新增一个挂载到容器内的媒体目录后，即可在首页浏览并创建翻译任务。</p>
      <UButton label="新增媒体库" icon="i-lucide-plus" color="primary" variant="soft" class="mt-1" @click="addMediaRoot" />
    </div>

    <UModal v-model:open="editorOpen" :ui="{ content: 'sm:max-w-3xl' }">
      <template #content>
        <div class="max-h-[85vh] overflow-y-auto">
          <div v-if="selectedRoot" class="app-card overflow-hidden">
            <div class="flex flex-wrap items-start justify-between gap-3 border-b border-gray-100 px-4 py-3 dark:border-gray-800">
              <div class="min-w-0">
                <div class="flex flex-wrap items-center gap-2">
                  <h2 class="truncate text-base font-semibold text-gray-900 dark:text-white">{{ selectedRoot.name || '未命名媒体库' }}</h2>
                  <UBadge v-if="selectedRoot.isDefault" color="primary" variant="subtle">默认库</UBadge>
                  <UBadge :color="selectedRoot.enabled !== false ? 'success' : 'neutral'" variant="subtle">{{ selectedRoot.enabled !== false ? '已启用' : '已停用' }}</UBadge>
                </div>
                <p class="mt-1 truncate font-mono text-xs text-gray-500 dark:text-gray-400" :title="selectedRoot.path">{{ selectedRoot.path || '未配置路径' }}</p>
              </div>
              <div class="flex flex-wrap items-center gap-1">
                <UButton icon="i-lucide-arrow-up" color="neutral" variant="ghost" size="xs" aria-label="上移媒体库" :disabled="selectedRootIndex <= 0" @click="moveRoot(selectedRootIndex, -1)" />
                <UButton icon="i-lucide-arrow-down" color="neutral" variant="ghost" size="xs" aria-label="下移媒体库" :disabled="selectedRootIndex >= mediaRoots.length - 1" @click="moveRoot(selectedRootIndex, 1)" />
                <UButton icon="i-lucide-trash-2" color="error" variant="ghost" size="xs" aria-label="删除媒体库" @click="openRemoveDialog(selectedRootIndex)" />
                <UButton icon="i-lucide-x" color="neutral" variant="ghost" size="xs" aria-label="关闭媒体库设置" @click="editorOpen = false" />
              </div>
            </div>

            <div class="space-y-4 p-4">
              <div class="grid grid-cols-1 gap-3 lg:grid-cols-2">
                <UFormField label="媒体库名称">
                  <UInput v-model="selectedRoot.name" placeholder="例如：电影库 / 剧集库" class="w-full" />
                </UFormField>
                <UFormField label="容器内路径">
                  <div class="flex gap-2">
                    <UInput v-model="selectedRoot.path" placeholder="/media/movies" class="w-full min-w-0 font-mono" />
                    <UButton label="检测" icon="i-lucide-search-check" color="neutral" variant="soft" :loading="inspectingId === selectedRoot.id" @click="inspectRoot(selectedRoot)" />
                  </div>
                </UFormField>
              </div>

              <div class="grid grid-cols-1 gap-2 sm:grid-cols-3">
                <UButton
                  :label="selectedRoot.isDefault ? '当前默认库' : '设为默认库'"
                  icon="i-lucide-star"
                  size="sm"
                  color="primary"
                  :variant="selectedRoot.isDefault ? 'soft' : 'ghost'"
                  :disabled="selectedRoot.isDefault || selectedRoot.enabled === false"
                  @click="setDefaultRoot(selectedRootIndex)"
                />
                <div class="app-stat-tile flex items-center justify-between gap-3">
                  <span class="text-sm text-gray-600 dark:text-gray-300">启用</span>
                  <USwitch v-model="selectedRoot.enabled" color="primary" :aria-label="`启用媒体库 ${selectedRoot.name}`" />
                </div>
                <div class="app-stat-tile flex items-center justify-between gap-3">
                  <div class="min-w-0">
                    <span class="text-sm text-gray-600 dark:text-gray-300">自动监控</span>
                    <p class="app-meta">在自动化中配置整库或子目录监控</p>
                  </div>
                  <UButton label="去配置" icon="i-lucide-arrow-up-right" size="xs" color="neutral" variant="ghost" to="/automation?tab=folders" />
                </div>
              </div>

              <div v-if="rootValidation(selectedRoot).length" class="app-info-banner app-info-error flex-col items-stretch gap-1">
                <p v-for="issue in rootValidation(selectedRoot)" :key="issue">{{ issue }}</p>
              </div>

              <div v-if="inspectionStates[selectedRoot.id]" class="app-info-banner" :class="inspectionStates[selectedRoot.id]?.ok ? 'app-info-success' : 'app-info-error'">
                <UIcon :name="inspectionStates[selectedRoot.id]?.ok ? 'i-lucide-badge-check' : 'i-lucide-badge-alert'" class="mt-0.5 h-4 w-4 shrink-0" />
                <div class="flex flex-wrap items-center gap-2">
                  <span class="font-medium">{{ inspectionStates[selectedRoot.id]?.ok ? '检测通过' : '检测失败' }}</span>
                  <span class="opacity-80">{{ inspectionStates[selectedRoot.id]?.message }}</span>
                </div>
              </div>

              <div class="app-card-muted p-3 text-xs leading-relaxed text-gray-600 dark:text-gray-300">
                <p class="font-medium text-gray-800 dark:text-gray-100">路径说明</p>
                <p class="mt-1">这里填写容器内路径，不是宿主机路径。修改路径后请重新检测。停用媒体库后首页不会显示它；自动监控统一在「自动化 → 监控目录」中管理。</p>
              </div>

              <div class="flex flex-wrap items-center justify-end gap-2 border-t border-gray-100 pt-3 dark:border-gray-800">
                <UButton label="关闭" color="neutral" variant="ghost" @click="editorOpen = false" />
                <UButton label="保存媒体库" color="primary" :loading="pending" :disabled="!isDirty && !forceSaveInvalidRoots && !!persistedRootIds.size" @click="save" />
              </div>
            </div>
          </div>
        </div>
      </template>
    </UModal>

    <details class="group app-card overflow-hidden">
      <summary class="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3">
        <div>
          <p class="text-sm font-semibold text-amber-700 dark:text-amber-300">挂载与排障</p>
          <p class="app-caption mt-0.5">宿主目录、容器路径、权限与监控目录的常见问题。</p>
        </div>
        <UIcon name="i-lucide-chevron-down" class="h-4 w-4 text-gray-400 transition-transform group-open:rotate-180" />
      </summary>
      <div class="grid grid-cols-1 gap-3 border-t border-gray-100 px-4 py-4 text-xs leading-relaxed dark:border-gray-800 md:grid-cols-2">
        <div class="app-card-muted space-y-1.5 p-3 text-gray-600 dark:text-gray-300">
          <p class="font-semibold text-gray-800 dark:text-gray-100">快速检查</p>
          <p>1. 确认宿主机目录已挂载到容器。</p>
          <p>2. 本页只填写容器内路径，例如 <code class="font-mono">/media/movies</code>。</p>
          <p>3. 保存前点击「检测」，确认目录可读取。</p>
          <p>4. 整库或子目录监控请在「自动化 → 监控目录」中配置。</p>
        </div>
        <div class="app-info-banner app-info-warning flex-col items-stretch gap-1.5">
          <p class="font-semibold text-amber-900 dark:text-amber-100">常见问题</p>
          <p>目录不存在：通常是挂载错误或路径填错。</p>
          <p>权限不足：检查宿主机目录权限与容器运行用户。</p>
          <p>保存失败：修复异常路径，或开启「允许保存不可访问的媒体库」。</p>
          <p>删除媒体库不会删除宿主机文件。</p>
        </div>
      </div>
    </details>

    <AppStickyBar>
      <template #info>
        <div class="app-toolbar-meta">
          <span>共 {{ mediaRoots.length }} 个媒体库</span>
          <span>·</span>
          <span>启用 {{ enabledRootCount }}</span>
          <span>·</span>
          <span>异常 {{ invalidRootCount }}</span>
          <span v-if="isDirty" class="text-amber-600 dark:text-amber-400">· 有未保存修改</span>
        </div>
      </template>
      <template #actions>
        <UButton label="取消" color="neutral" variant="ghost" to="/" />
        <UButton label="保存媒体库" color="primary" :loading="pending" :disabled="!isDirty && !forceSaveInvalidRoots && !!persistedRootIds.size" @click="save" />
      </template>
    </AppStickyBar>

    <UModal v-model:open="removeDialogOpen" title="确认删除媒体库" description="删除后将移除该媒体库配置，但不会删除宿主机上的真实文件。">
      <template #content>
        <div class="space-y-4 p-5">
          <div class="app-info-banner app-info-error break-all text-sm">
            <div>
              即将删除媒体库：{{ removeTargetRoot?.name || '未命名媒体库' }}
              <div class="mt-1 text-xs opacity-80">{{ removeTargetRoot?.path || '未配置路径' }}</div>
            </div>
          </div>
          <div class="flex items-center justify-end gap-3">
            <UButton label="取消" color="neutral" variant="ghost" @click="removeDialogOpen = false" />
            <UButton label="确认删除" color="error" @click="confirmRemoveMediaRoot" />
          </div>
        </div>
      </template>
    </UModal>
  </AppContainer>
</template>

<script setup lang="ts">
import type { MediaRoot } from '~~/types'

useHead({
  title: '媒体库管理 - SubX'
})

const toast = useToast()
const { confirm } = useConfirm()
const pending = ref(false)
const inspectingId = ref('')
const batchInspecting = ref(false)
const forceSaveInvalidRoots = ref(false)
const removeDialogOpen = ref(false)
const editorOpen = ref(false)
const draggingRootId = ref('')
const dragOverRootId = ref('')
const removeTargetIndex = ref(-1)

const { data, refresh } = await useAppConfigData()
const config = ref<any>(data.value || {})
const mediaRoots = ref<MediaRoot[]>(normalizeMediaRootIds(Array.isArray(config.value?.mediaRoots) ? config.value.mediaRoots : []))
function ensureSingleDefault() {
  for (const root of mediaRoots.value) {
    if (root.enabled === false) root.isDefault = false
  }
  const active = mediaRoots.value.filter(root => root.enabled !== false)
  if (!active.length) return
  const defaults = active.filter(root => root.isDefault)
  if (!defaults.length) {
    active[0]!.isDefault = true
  } else if (defaults.length > 1) {
    for (const root of defaults.slice(1)) root.isDefault = false
  }
}
ensureSingleDefault()
const selectedRootId = ref(mediaRoots.value[0]?.id || '')
const librarySearch = ref('')
const libraryStatusFilter = ref('all')
const persistedRootIds = ref<Set<string>>(new Set(mediaRoots.value.map(root => root.id)))
const initialSnapshot = ref(JSON.stringify(sanitizeMediaRoots()))
const inspectionStates = ref<Record<string, { ok: boolean, message: string, path?: string }>>({})
const selectedRoot = computed(() => mediaRoots.value.find(root => root.id === selectedRootId.value) || null)
const selectedRootIndex = computed(() => mediaRoots.value.findIndex(root => root.id === selectedRootId.value))
const removeTargetRoot = computed(() => removeTargetIndex.value >= 0 ? mediaRoots.value[removeTargetIndex.value] : null)
const defaultRootCount = computed(() => mediaRoots.value.filter(root => root.isDefault).length)
const enabledRootCount = computed(() => mediaRoots.value.filter(root => root.enabled !== false).length)
const disabledRootCount = computed(() => mediaRoots.value.filter(root => root.enabled === false).length)
const invalidRootCount = computed(() => mediaRoots.value.filter(root => rootValidation(root).length > 0 || inspectionStates.value[root.id]?.ok === false).length)
const isDirty = computed(() => initialSnapshot.value !== JSON.stringify(sanitizeMediaRoots()))
const libraryStatusOptions = computed(() => [
  { label: `全部 (${mediaRoots.value.length})`, value: 'all' },
  { label: `已启用 (${enabledRootCount.value})`, value: 'enabled' },
  { label: `已停用 (${disabledRootCount.value})`, value: 'disabled' },
  { label: `异常 (${invalidRootCount.value})`, value: 'invalid' }
])
const filteredMediaRoots = computed(() => {
  const keyword = librarySearch.value.trim().toLowerCase()
  return mediaRoots.value.filter(root => {
    if (keyword) {
      const haystack = `${root.name || ''} ${root.path || ''}`.toLowerCase()
      if (!haystack.includes(keyword)) return false
    }
    if (libraryStatusFilter.value === 'enabled' && root.enabled === false) return false
    if (libraryStatusFilter.value === 'disabled' && root.enabled !== false) return false
    if (libraryStatusFilter.value === 'invalid' && !rootValidation(root).length && inspectionStates.value[root.id]?.ok !== false) return false
    return true
  })
})

function statusIcon(root: MediaRoot) {
  if (inspectionStates.value[root.id]?.ok === false || rootValidation(root).length) return 'i-lucide-circle-alert'
  if (inspectionStates.value[root.id]?.ok) return 'i-lucide-circle-check'
  return root.enabled !== false ? 'i-lucide-folder' : 'i-lucide-folder-x'
}

function statusIconClass(root: MediaRoot) {
  if (inspectionStates.value[root.id]?.ok === false || rootValidation(root).length) return 'text-red-500'
  if (inspectionStates.value[root.id]?.ok) return 'text-green-500'
  return root.enabled !== false ? 'text-gray-400' : 'text-gray-300 dark:text-gray-600'
}

const validationMap = computed(() => {
  const active = mediaRoots.value.filter(root => root.enabled !== false)
  const hasActiveDefault = active.some(root => root.isDefault)
  const pathOwners = new Map<string, MediaRoot[]>()

  for (const root of active) {
    const path = String(root.path || '').trim()
    if (!path) continue
    const owners = pathOwners.get(path) || []
    owners.push(root)
    pathOwners.set(path, owners)
  }

  const map = new Map<string, string[]>()
  for (const root of mediaRoots.value) {
    const issues: string[] = []
    const name = String(root.name || '').trim()
    const path = String(root.path || '').trim()
    if (root.enabled !== false && !name) issues.push('媒体库名称不能为空')
    if (root.enabled !== false && !path) issues.push('容器内路径不能为空')
    if (root.enabled !== false && path) {
      const owners = pathOwners.get(path) || []
      const duplicate = owners.find(item => item.id !== root.id)
      if (duplicate) issues.push(`路径与其他媒体库重复：${duplicate.name || duplicate.id}`)
    }
    if (root.enabled !== false && !root.isDefault && !hasActiveDefault) {
      issues.push('至少需要一个启用的默认媒体库')
    }
    map.set(root.id, issues)
  }
  return map
})

function rootValidation(root: MediaRoot) {
  return validationMap.value.get(root.id) || []
}

function rootPosition(root: MediaRoot) {
  return mediaRoots.value.indexOf(root) + 1
}

function selectRoot(id: string) {
  selectedRootId.value = id
  editorOpen.value = true
}

function clearLibraryFilters() {
  librarySearch.value = ''
  libraryStatusFilter.value = 'all'
}

watch([librarySearch, libraryStatusFilter], () => {
  const list = filteredMediaRoots.value
  if (list.length && !list.some(root => root.id === selectedRootId.value)) {
    selectedRootId.value = list[0]!.id
  }
})

function ensureSelection() {
  if (selectedRoot.value) return
  selectedRootId.value = mediaRoots.value[0]?.id || ''
}

function normalizeMediaRootIds(roots: MediaRoot[]) {
  const usedIds = new Set<string>()
  return roots.map((root, index) => {
    const next = { ...root, id: String(root.id || `root-${index + 1}`) }
    if (usedIds.has(next.id)) {
      let suffix = index + 1
      while (usedIds.has(`${next.id}-${suffix}`)) suffix += 1
      next.id = `${next.id}-${suffix}`
    }
    usedIds.add(next.id)
    return next
  })
}

function sanitizeMediaRoots(list: MediaRoot[] = mediaRoots.value) {
  return list.map((root, index) => {
    const sourceIndex = mediaRoots.value.indexOf(root)
    return {
      id: String(root.id || `root-${index + 1}`),
      name: String(root.name || '').trim(),
      path: String(root.path || '').trim(),
      enabled: root.enabled !== false,
      isDefault: root.isDefault === true,
      order: sourceIndex >= 0 ? sourceIndex : index
    }
  })
}

function refreshSnapshot() {
  initialSnapshot.value = JSON.stringify(sanitizeMediaRoots())
  persistedRootIds.value = new Set(mediaRoots.value.map(root => root.id))
}

function addMediaRoot() {
  const id = `root-${Date.now()}`
  mediaRoots.value.push({ id, name: `媒体库 ${mediaRoots.value.length + 1}`, path: '', enabled: true, order: mediaRoots.value.length, isDefault: mediaRoots.value.length === 0 })
  selectedRootId.value = id
  editorOpen.value = true
}

function startRootDrag(root: MediaRoot, event: DragEvent) {
  draggingRootId.value = root.id
  dragOverRootId.value = ''
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', root.id)
  }
}

function endRootDrag() {
  draggingRootId.value = ''
  dragOverRootId.value = ''
}

function dropRoot(target: MediaRoot) {
  const fromId = draggingRootId.value
  if (!fromId || fromId === target.id) {
    endRootDrag()
    return
  }
  const fromIndex = mediaRoots.value.findIndex(root => root.id === fromId)
  const toIndex = mediaRoots.value.findIndex(root => root.id === target.id)
  if (fromIndex < 0 || toIndex < 0) {
    endRootDrag()
    return
  }
  const next = [...mediaRoots.value]
  const [moved] = next.splice(fromIndex, 1)
  if (!moved) {
    endRootDrag()
    return
  }
  next.splice(toIndex, 0, moved)
  mediaRoots.value = next.map((root, index) => ({ ...root, order: index }))
  endRootDrag()
}

function removeMediaRoot(index: number) {
  const removed = mediaRoots.value[index]
  mediaRoots.value.splice(index, 1)
  if (removed?.id) delete inspectionStates.value[removed.id]
  if (removed?.isDefault && mediaRoots.value.length) mediaRoots.value[0]!.isDefault = true
  if (selectedRootId.value === removed?.id) selectedRootId.value = mediaRoots.value[Math.min(index, mediaRoots.value.length - 1)]?.id || ''
  if (!mediaRoots.value.length) editorOpen.value = false
}

function openRemoveDialog(index: number) {
  removeTargetIndex.value = index
  removeDialogOpen.value = true
}

function confirmRemoveMediaRoot() {
  if (removeTargetIndex.value < 0) return
  removeMediaRoot(removeTargetIndex.value)
  removeDialogOpen.value = false
  removeTargetIndex.value = -1
}

function setDefaultRoot(index: number) {
  mediaRoots.value.forEach((root, i) => { root.isDefault = i === index })
}

function moveRoot(index: number, delta: number) {
  const target = index + delta
  if (target < 0 || target >= mediaRoots.value.length) return
  const arr = [...mediaRoots.value]
  const [item] = arr.splice(index, 1)
  if (!item) return
  arr.splice(target, 0, item)
  mediaRoots.value = arr.map((root, i) => ({ ...root, order: i }))
}

async function inspectRoot(root: MediaRoot) {
  inspectingId.value = root.id
  try {
    const result = await $fetch('/api/media-roots/inspect', { method: 'POST', body: { root } })
    inspectionStates.value[root.id] = { ok: !!result.ok, message: result.message, path: result.path }
  } catch (e: any) {
    inspectionStates.value[root.id] = { ok: false, message: e?.data?.message || '检测失败', path: root.path }
  } finally {
    inspectingId.value = ''
  }
}

async function inspectAllRoots(showToast = true, targets: MediaRoot[] = mediaRoots.value) {
  batchInspecting.value = true
  try {
    const res = await $fetch('/api/media-roots/inspect-all', { method: 'POST', body: { roots: sanitizeMediaRoots(targets) } })
    for (const item of res.results || []) {
      inspectionStates.value[item.id] = { ok: !!item.ok, message: item.message, path: item.path }
    }
    if (showToast) {
      toast.add({ title: '检测完成', description: `已检测 ${res.results?.length || 0} 个媒体库`, color: 'success' })
    }
    return res.results || []
  } catch (e: any) {
    if (showToast) {
      toast.add({ title: '检测失败', description: e?.data?.message || '无法批量检测媒体库', color: 'error' })
    }
    throw e
  } finally {
    batchInspecting.value = false
  }
}

async function save() {
  const roots = sanitizeMediaRoots()
  const enabledRoots = roots.filter(root => root.enabled !== false)

  const validationErrors: string[] = []
  for (const root of mediaRoots.value) {
    validationErrors.push(...rootValidation(root))
  }
  if (validationErrors.length) {
    toast.add({ title: '请先修复配置', description: Array.from(new Set(validationErrors)).join('；'), color: 'warning' })
    return
  }

  pending.value = true
  try {
    if (enabledRoots.length > 0) {
      const savedRoots = Array.isArray(config.value?.mediaRoots) ? config.value.mediaRoots : []
      const inspectTargets = mediaRoots.value.filter(root => {
        if (root.enabled === false) return false
        const saved = savedRoots.find((item: any) => item.id === root.id)
        const pathChanged = !saved || String(saved.path || '').trim() !== String(root.path || '').trim()
        const state = inspectionStates.value[root.id]
        return pathChanged || Boolean(state && (state.ok === false || String(state.path || '') !== String(root.path || '').trim()))
      })
      if (inspectTargets.length) {
        await inspectAllRoots(false, inspectTargets)
      }
      const failedRoots = mediaRoots.value.filter(root => {
        if (root.enabled === false) return false
        return inspectionStates.value[root.id]?.ok === false
      })
      if (failedRoots.length > 0 && !forceSaveInvalidRoots.value) {
        toast.add({ title: '存在不可访问的媒体库', description: `请先修复 ${failedRoots.length} 个无效媒体库，或启用强制保存。`, color: 'warning' })
        return
      }
    }

    await $fetch('/api/config', { method: 'PUT', body: { mediaRoots: roots } })
    clearNuxtData('app:config')
    await refresh()
    config.value = data.value || config.value
    if (Array.isArray(config.value?.mediaRoots)) {
      mediaRoots.value = normalizeMediaRootIds(config.value.mediaRoots)
    }
    for (const root of mediaRoots.value) {
      const state = inspectionStates.value[root.id]
      if (state?.path && state.path !== String(root.path || '').trim()) {
        delete inspectionStates.value[root.id]
      }
    }
    ensureSelection()
    refreshSnapshot()
    toast.add({ title: '保存成功', description: '媒体库配置已保存，可继续编辑。', color: 'success' })
  } catch (e: any) {
    toast.add({ title: '保存失败', description: e?.data?.message || e?.message || '无法保存媒体库设置', color: 'error' })
  } finally {
    pending.value = false
  }
}

function handleBeforeUnload(event: BeforeUnloadEvent) {
  if (!isDirty.value) return
  event.preventDefault()
  event.returnValue = ''
}

watch(mediaRoots, () => {
  ensureSingleDefault()
}, { deep: true })

onMounted(() => {
  ensureSelection()
  window.addEventListener('beforeunload', handleBeforeUnload)
})

onBeforeUnmount(() => {
  window.removeEventListener('beforeunload', handleBeforeUnload)
})

onBeforeRouteLeave(async () => {
  if (!isDirty.value) return true
  return await confirm({
    title: '离开媒体库管理？',
    description: '当前有未保存的媒体库修改，离开后会丢失。',
    confirmLabel: '放弃修改并离开',
    color: 'warning'
  })
})
</script>
