<template>
  <AppContainer size="default" class="space-y-5 pb-28">
    <PageHeader
      title="媒体库管理"
      description="管理首页可浏览的媒体目录，并配置自动监控。"
      :breadcrumb="[{ label: '首页', icon: 'i-lucide-home', to: '/' }, { label: '媒体库管理', icon: 'i-lucide-library-big', to: '/media-libraries' }]"
    >
      <template #actions>
        <UBadge v-if="isDirty" color="warning" variant="subtle">有未保存修改</UBadge>
        <UButton label="返回首页" variant="outline" icon="i-lucide-arrow-left" color="neutral" size="sm" to="/" />
      </template>
    </PageHeader>

    <div class="surface-card space-y-3 p-3 sm:p-4">
      <div class="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div class="flex flex-wrap items-center gap-2">
          <UBadge color="neutral" variant="subtle">共 {{ mediaRoots.length }} 个</UBadge>
          <UBadge color="success" variant="subtle">启用 {{ enabledRootCount }}</UBadge>
          <UBadge color="primary" variant="subtle">默认 {{ defaultRootCount }}</UBadge>
          <UBadge :color="invalidRootCount ? 'error' : 'success'" variant="subtle">异常 {{ invalidRootCount }}</UBadge>
          <UBadge color="primary" variant="subtle">自动监控 {{ watchedRootCount }}</UBadge>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <UButton label="新增媒体库" icon="i-lucide-plus" size="sm" color="primary" variant="soft" @click="addMediaRoot" />
          <UButton label="批量检测" icon="i-lucide-scan-search" size="sm" color="neutral" variant="ghost" :loading="batchInspecting" @click="inspectAllRoots()" />
          <UButton label="自动化设置" icon="i-lucide-workflow" size="sm" color="neutral" variant="ghost" to="/automation" />
        </div>
      </div>
      <div class="flex flex-wrap items-center gap-3 border-t border-gray-100 pt-3 text-xs text-gray-500 dark:border-gray-800 dark:text-gray-400">
        <div class="flex items-center gap-2 rounded-full border border-gray-200 px-2.5 py-1 dark:border-gray-700">
          <USwitch v-model="forceSaveInvalidRoots" color="primary" size="sm" aria-label="允许保存不可访问的媒体库" />
          <span>允许保存不可访问的媒体库</span>
        </div>
        <span>路径填写容器内路径，保存前建议先检测。</span>
      </div>
    </div>

    <div v-if="mediaRoots.length" class="space-y-4">
      <div class="surface-card p-3 sm:p-4">
        <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
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
          <span class="text-[11px] text-gray-500 dark:text-gray-400">显示 {{ filteredMediaRoots.length }} / {{ mediaRoots.length }}</span>
        </div>
      </div>

      <div class="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        <button
          v-for="root in filteredMediaRoots"
          :key="root.id"
          type="button"
          class="group flex min-h-[164px] flex-col rounded-2xl border bg-white p-4 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary-200 hover:shadow-md dark:bg-gray-950/60 dark:hover:border-primary-900/50"
          :class="rootValidation(root).length || inspectionStates[root.id]?.ok === false
            ? 'border-red-200 dark:border-red-900/40'
            : 'border-gray-200/80 dark:border-gray-800'"
          @click="selectRoot(root.id)"
        >
          <div class="flex items-start justify-between gap-3">
            <div class="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-50 text-primary-700 dark:bg-primary-950/30 dark:text-primary-300">
              <UIcon name="i-lucide-library-big" class="h-5 w-5" />
            </div>
            <UIcon :name="statusIcon(root)" class="mt-1 h-4 w-4 shrink-0" :class="statusIconClass(root)" />
          </div>
          <p class="mt-3 truncate text-sm font-semibold text-gray-900 dark:text-white">{{ root.name || '未命名媒体库' }}</p>
          <p class="mt-1 line-clamp-2 break-all font-mono text-[11px] leading-5 text-gray-500 dark:text-gray-400" :title="root.path">{{ root.path || '未配置路径' }}</p>
          <div class="mt-auto flex flex-wrap items-center gap-1 pt-3">
            <span v-if="root.isDefault" class="rounded-md bg-primary-50 px-1.5 py-0.5 text-[10px] font-medium text-primary-700 dark:bg-primary-950/30 dark:text-primary-300">默认</span>
            <span class="rounded-md px-1.5 py-0.5 text-[10px] font-medium" :class="root.enabled !== false ? 'bg-green-50 text-green-700 dark:bg-green-950/30 dark:text-green-300' : 'bg-gray-100 text-gray-600 dark:bg-gray-900 dark:text-gray-300'">{{ root.enabled !== false ? '已启用' : '已停用' }}</span>
            <span v-if="isRootWatched(root)" class="rounded-md bg-primary-50 px-1.5 py-0.5 text-[10px] font-medium text-primary-700 dark:bg-primary-950/30 dark:text-primary-300">监控中</span>
            <span v-if="rootValidation(root).length" class="rounded-md bg-red-50 px-1.5 py-0.5 text-[10px] font-medium text-red-700 dark:bg-red-950/30 dark:text-red-300">配置异常</span>
            <span class="ml-auto text-[10px] text-gray-500 dark:text-gray-400">#{{ rootPosition(root) }}</span>
          </div>
        </button>
      </div>

      <div v-if="!filteredMediaRoots.length" class="surface-card space-y-2 px-2 py-10 text-center text-xs text-gray-500 dark:text-gray-400">
        <UIcon name="i-lucide-search-x" class="mx-auto h-5 w-5 text-gray-300 dark:text-gray-600" />
        <p>没有匹配的媒体库</p>
        <UButton label="清空筛选" size="xs" color="neutral" variant="soft" @click="clearLibraryFilters" />
      </div>
    </div>

    <div v-else class="rounded-3xl border border-dashed border-gray-300 bg-gray-50/60 p-8 text-center dark:border-gray-700 dark:bg-gray-900/20">
      <UIcon name="i-lucide-library-big" class="mx-auto h-8 w-8 text-gray-300 dark:text-gray-600" />
      <div class="mt-3">
        <p class="text-sm font-medium text-gray-700 dark:text-gray-200">当前还没有媒体库</p>
        <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">新增一个挂载到容器内的媒体目录后，即可在首页浏览并创建翻译任务。</p>
      </div>
      <UButton label="新增媒体库" icon="i-lucide-plus" color="primary" variant="soft" class="mt-3" @click="addMediaRoot" />
    </div>

    <UModal v-model:open="editorOpen" :ui="{ content: 'sm:max-w-3xl' }">
      <template #content>
        <div class="max-h-[85vh] overflow-y-auto">
          <div v-if="selectedRoot" class="surface-card overflow-hidden">
            <div class="flex flex-wrap items-start justify-between gap-3 border-b border-gray-100 px-4 py-3 dark:border-gray-800">
              <div class="min-w-0">
                <div class="flex flex-wrap items-center gap-2">
                  <h2 class="truncate text-base font-semibold text-gray-900 dark:text-white">{{ selectedRoot.name || '未命名媒体库' }}</h2>
                  <UBadge v-if="selectedRoot.isDefault" color="primary" variant="subtle">默认库</UBadge>
                  <UBadge :color="selectedRoot.enabled !== false ? 'success' : 'neutral'" variant="subtle">{{ selectedRoot.enabled !== false ? '已启用' : '已停用' }}</UBadge>
                  <UBadge v-if="isRootWatched(selectedRoot)" color="primary" variant="subtle">自动监控</UBadge>
                </div>
                <p class="mt-1 truncate font-mono text-[11px] text-gray-500 dark:text-gray-400" :title="selectedRoot.path">{{ selectedRoot.path || '未配置路径' }}</p>
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
                <div class="flex items-center justify-between gap-3 rounded-xl border border-gray-100 bg-gray-50/70 px-3 py-2 dark:border-gray-800 dark:bg-gray-900/30">
                  <span class="text-sm text-gray-600 dark:text-gray-300">启用</span>
                  <USwitch v-model="selectedRoot.enabled" color="primary" :aria-label="`启用媒体库 ${selectedRoot.name}`" />
                </div>
                <div class="flex items-center justify-between gap-3 rounded-xl border border-gray-100 bg-gray-50/70 px-3 py-2 dark:border-gray-800 dark:bg-gray-900/30">
                  <span class="text-sm text-gray-600 dark:text-gray-300">自动监控</span>
                  <USwitch
                    :model-value="isRootWatched(selectedRoot)"
                    color="primary"
                    :disabled="!selectedRoot.path || selectedRoot.enabled === false || watchPending[selectedRoot.id] || !isRootPathSaved(selectedRoot)"
                    :aria-label="`自动监控 ${selectedRoot.name}`"
                    :title="selectedRoot.enabled === false ? '停用的媒体库不会自动监控' : isRootPathSaved(selectedRoot) ? '自动处理该媒体库新增视频' : '请先保存媒体库路径，再开启自动监控'"
                    @update:model-value="toggleRootWatch(selectedRoot, $event)"
                  />
                </div>
              </div>

              <div v-if="rootValidation(selectedRoot).length" class="rounded-xl border border-red-100 bg-red-50/80 px-3 py-2 text-xs leading-relaxed text-red-700 dark:border-red-900/40 dark:bg-red-950/20 dark:text-red-300">
                <p v-for="issue in rootValidation(selectedRoot)" :key="issue">{{ issue }}</p>
              </div>

              <div v-if="inspectionStates[selectedRoot.id]" class="rounded-xl border px-3 py-2 text-xs leading-relaxed" :class="inspectionStates[selectedRoot.id]?.ok ? 'border-green-100 bg-green-50/80 text-green-700 dark:border-green-900/40 dark:bg-green-950/15 dark:text-green-300' : 'border-red-100 bg-red-50/80 text-red-700 dark:border-red-900/40 dark:bg-red-950/15 dark:text-red-300'">
                <div class="flex flex-wrap items-center gap-2">
                  <UIcon :name="inspectionStates[selectedRoot.id]?.ok ? 'i-lucide-badge-check' : 'i-lucide-badge-alert'" class="h-4 w-4 shrink-0" />
                  <span class="font-medium">{{ inspectionStates[selectedRoot.id]?.ok ? '检测通过' : '检测失败' }}</span>
                  <span class="opacity-80">{{ inspectionStates[selectedRoot.id]?.message }}</span>
                </div>
              </div>

              <div class="rounded-xl border border-gray-200/70 bg-gray-50/70 p-3 text-xs leading-relaxed text-gray-600 dark:border-gray-800 dark:bg-gray-900/30 dark:text-gray-300">
                <p class="font-medium text-gray-800 dark:text-gray-100">路径说明</p>
                <p class="mt-1">这里填写容器内路径，不是宿主机路径。修改路径后请重新检测。停用媒体库后首页不会显示它，自动监控也会关闭，但配置会保留。</p>
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

    <details class="group surface-card overflow-hidden">
      <summary class="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3">
        <div>
          <p class="text-sm font-semibold text-amber-700 dark:text-amber-300">挂载与排障</p>
          <p class="mt-0.5 text-xs text-gray-500 dark:text-gray-400">宿主目录、容器路径、权限与自动监控的常见问题。</p>
        </div>
        <UIcon name="i-lucide-chevron-down" class="h-4 w-4 text-gray-400 transition-transform group-open:rotate-180" />
      </summary>
      <div class="grid grid-cols-1 gap-3 border-t border-gray-100 px-4 py-4 text-xs leading-relaxed dark:border-gray-800 md:grid-cols-2">
        <div class="space-y-1.5 rounded-xl border border-gray-200/70 bg-gray-50/70 p-3 text-gray-600 dark:border-gray-800 dark:bg-gray-900/30 dark:text-gray-300">
          <p class="font-semibold text-gray-800 dark:text-gray-100">快速检查</p>
          <p>1. 确认宿主机目录已挂载到容器。</p>
          <p>2. 本页只填写容器内路径，例如 <code class="font-mono">/media/movies</code>。</p>
          <p>3. 保存前点击「检测」，确认目录可读取。</p>
          <p>4. 自动监控只处理保存后的媒体库。</p>
        </div>
        <div class="space-y-1.5 rounded-xl border border-amber-100 bg-amber-50/70 p-3 text-amber-700 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-200">
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
        <div class="flex flex-wrap items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
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
          <div class="break-all rounded-xl border border-red-100 bg-red-50/80 p-3 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-950/20 dark:text-red-300">
            即将删除媒体库：{{ removeTargetRoot?.name || '未命名媒体库' }}
            <div class="mt-1 text-xs opacity-80">{{ removeTargetRoot?.path || '未配置路径' }}</div>
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
const watchPending = ref<Record<string, boolean>>({})
const { data: watchData, refresh: refreshWatch } = await useWatchFoldersData()
const watchFolders = computed(() => watchData.value?.folders || [])

const selectedRoot = computed(() => mediaRoots.value.find(root => root.id === selectedRootId.value) || null)
const selectedRootIndex = computed(() => mediaRoots.value.findIndex(root => root.id === selectedRootId.value))
const removeTargetRoot = computed(() => removeTargetIndex.value >= 0 ? mediaRoots.value[removeTargetIndex.value] : null)
const defaultRootCount = computed(() => mediaRoots.value.filter(root => root.isDefault).length)
const enabledRootCount = computed(() => mediaRoots.value.filter(root => root.enabled !== false).length)
const disabledRootCount = computed(() => mediaRoots.value.filter(root => root.enabled === false).length)
const watchedRootCount = computed(() => mediaRoots.value.filter(root => isRootWatched(root)).length)
const invalidRootCount = computed(() => mediaRoots.value.filter(root => rootValidation(root).length > 0 || inspectionStates.value[root.id]?.ok === false).length)
const isDirty = computed(() => initialSnapshot.value !== JSON.stringify(sanitizeMediaRoots()))
const libraryStatusOptions = computed(() => [
  { label: `全部 (${mediaRoots.value.length})`, value: 'all' },
  { label: `已启用 (${enabledRootCount.value})`, value: 'enabled' },
  { label: `已停用 (${disabledRootCount.value})`, value: 'disabled' },
  { label: `异常 (${invalidRootCount.value})`, value: 'invalid' },
  { label: `监控中 (${watchedRootCount.value})`, value: 'watched' }
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
    if (libraryStatusFilter.value === 'watched' && !isRootWatched(root)) return false
    return true
  })
})

function watchedFolder(root: MediaRoot) {
  return watchFolders.value.find((folder: any) => folder.rootId === root.id && !folder.path)
}

function isRootWatched(root: MediaRoot) {
  return !!watchedFolder(root)
}

function isRootPathSaved(root: MediaRoot) {
  const saved = (config.value?.mediaRoots || []).find((item: any) => item.id === root.id)
  return Boolean(saved) && String(saved.path || '').trim() === String(root.path || '').trim()
}

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

async function toggleRootWatch(root: MediaRoot, enabled: boolean) {
  watchPending.value[root.id] = true
  try {
    const existing = watchedFolder(root)
    if (enabled && !existing) {
      await $fetch('/api/watch-folders', {
        method: 'POST',
        body: { rootId: root.id, path: '', enabled: true, recursive: true, mode: 'new', rules: {}, outputPolicy: {} }
      })
    } else if (!enabled && existing) {
      await $fetch(`/api/watch-folders/${existing.id}`, { method: 'DELETE' })
    }
    await refreshWatch()
    toast.add({ title: enabled ? '已开启自动监控' : '已关闭自动监控', description: root.name, color: 'success' })
  } catch (e: any) {
    toast.add({ title: '操作失败', description: e?.data?.message || e?.message || '请先保存媒体库后再开启监控', color: 'error' })
  } finally {
    watchPending.value[root.id] = false
  }
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
    await Promise.all([refresh(), refreshWatch()])
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
