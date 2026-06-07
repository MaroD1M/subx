<template>
  <div ref="layoutRef" class="relative flex min-h-[720px] h-[calc(100vh-11.5rem)] max-h-[1120px] gap-3.5 glass-panel rounded-3xl p-5 overflow-hidden">
    <div v-if="resizeMode" class="absolute top-3 left-1/2 -translate-x-1/2 z-20 px-2.5 py-1 rounded-full bg-gray-900/85 text-white text-[11px] font-medium shadow-lg">
      {{ resizeHint }}
    </div>

    <div class="surface-card flex flex-col p-3 min-w-[280px] stagger-fade-in" :style="{ width: `${leftPaneWidth}%` }">
      <div class="space-y-3 mb-3.5 pb-2 border-b border-gray-100/90 dark:border-gray-800/70">
        <div class="flex flex-wrap items-center gap-2">
          <UIcon name="i-lucide-folder" class="w-5 h-5 text-primary-500" />
          <h3 class="text-[13px] font-semibold tracking-wide text-gray-700 dark:text-gray-300">文件浏览器</h3>
          <div class="ml-auto flex flex-wrap items-center justify-end gap-1.5">
            <UButton label="媒体库" icon="i-lucide-library-big" color="neutral" variant="soft" size="xs" to="/media-libraries" />
            <UButton label="收起目录" icon="i-lucide-panel-left-close" color="neutral" variant="ghost" size="xs" title="收起全部目录" @click="collapseAllDirectories" />
            <UButton label="刷新" icon="i-lucide-refresh-cw" color="neutral" variant="ghost" size="xs" :loading="loadingFiles" @click="refreshFiles" title="刷新文件" />
            <UButton icon="i-lucide-folder-plus" color="neutral" variant="ghost" size="xs" title="新建文件夹" class="text-gray-400 hover:text-gray-700 dark:hover:text-gray-300" @click="createFolder" />
            <UButton icon="i-lucide-pencil" color="neutral" variant="ghost" size="xs" title="重命名" class="text-gray-400 hover:text-gray-700 dark:hover:text-gray-300" :disabled="!selectedNode || !canMutateSelected" @click="renameNode" />
            <UButton icon="i-lucide-trash-2" color="error" variant="ghost" size="xs" title="删除" class="text-gray-400 hover:text-red-600" :disabled="!selectedNode || !canMutateSelected" @click="deleteNode" />
          </div>
        </div>

        <div class="grid grid-cols-1 gap-2 lg:grid-cols-[minmax(180px,220px)_minmax(0,1fr)] items-end">
          <UFormField label="当前媒体库" class="min-w-0">
            <USelect v-model="activeRootId" :items="rootItems" class="w-full" :disabled="!rootItems.length" @update:model-value="handleRootChange" />
          </UFormField>
          <UFormField label="快速筛选" class="min-w-0">
            <UInput v-model="searchQuery" icon="i-lucide-search" placeholder="例如：S01E01 / 中文字幕 / mkv" class="w-full" />
          </UFormField>
        </div>
      </div>

      <div v-if="searchQuery" class="mb-3 flex justify-end">
        <UButton label="清除筛选" size="2xs" color="neutral" variant="ghost" icon="i-lucide-x" @click="searchQuery = ''" />
      </div>

      <div class="relative flex-1 min-h-0">
        <div class="absolute top-0 left-0 right-0 h-3 bg-gradient-to-b from-white/70 dark:from-gray-900/65 to-transparent pointer-events-none z-10" />
        <div class="absolute bottom-0 left-0 right-0 h-2 bg-gradient-to-t from-white/40 dark:from-gray-900/45 to-transparent pointer-events-none z-10" />
        <div class="h-full overflow-y-auto space-y-1 pr-1 custom-scrollbar">
          <template v-for="node in displayNodes" :key="`${node.rootId || 'group'}:${node.path || node.name}`">
            <FileNodeItem :node="node" :selected-path="selectedNodeKey" :expanded-keys="expandedNodeKeys" @select="onSelect" @toggle-dir="toggleDirectory" />
          </template>
          <div v-if="!loadingFiles && (!displayNodes || !displayNodes.length)" class="h-full min-h-[180px] flex items-center justify-center text-center px-3">
            <div v-if="isRootUnavailable" class="space-y-3">
              <p class="text-sm font-medium text-amber-600 dark:text-amber-400">当前媒体库暂不可访问</p>
              <p class="text-xs text-neutral-400 max-w-xs">{{ rootAccessMessage }}</p>

              <div class="flex items-center justify-center gap-2 flex-wrap">
                <UButton label="管理媒体库" size="xs" color="primary" variant="soft" icon="i-lucide-library-big" to="/media-libraries" />
                <UButton label="刷新列表" size="xs" color="neutral" variant="ghost" icon="i-lucide-refresh-cw" :loading="loadingFiles" @click="refreshFiles" />
              </div>
            </div>
            <div v-else class="space-y-3">
              <p class="text-sm font-medium text-gray-600 dark:text-gray-300">当前媒体库暂无内容</p>
              <div class="flex items-center justify-center gap-2 flex-wrap">
                <UButton label="刷新列表" size="xs" color="neutral" variant="ghost" icon="i-lucide-refresh-cw" :loading="loadingFiles" @click="refreshFiles" />
                <UButton label="管理媒体库" size="xs" color="primary" variant="soft" icon="i-lucide-library-big" to="/media-libraries" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="w-2 rounded-full bg-gray-200/80 dark:bg-gray-700/80 hover:bg-primary-300 dark:hover:bg-primary-700 cursor-col-resize transition-colors" :class="{ 'bg-primary-400 dark:bg-primary-600': resizeMode === 'main' }" title="拖动调整左右分区宽度" @mousedown.prevent="startResize('main', $event)" />

    <div ref="rightPaneRef" class="surface-card flex-1 flex flex-col min-w-[340px] p-3 stagger-fade-in" style="animation-delay: 70ms;">
      <div class="flex items-center justify-end mb-2.5 pb-2 border-b border-gray-100/90 dark:border-gray-800/70">
        <UButton label="恢复默认布局" size="xs" variant="ghost" color="neutral" icon="i-lucide-rotate-ccw" @click="resetLayout" />
      </div>

      <div v-if="selectedFile" class="h-full flex flex-col min-h-0">
        <div class="flex items-center gap-2 mb-3 pb-2 border-b border-gray-100/90 dark:border-gray-800/70">
          <UIcon :name="isSubtitleFile ? 'i-lucide-file-text' : 'i-lucide-video'" class="w-5 h-5 text-sky-500" />
          <div class="min-w-0">
            <h3 class="text-sm font-semibold text-gray-700 dark:text-gray-300 truncate" :title="selectedFile.name">{{ isSubtitleFile ? '字幕文件已就绪：' : '字幕轨道：' }}{{ selectedFile.name }}</h3>
            <p class="text-[11px] text-gray-500 dark:text-gray-400 truncate" :title="selectedFile.path">{{ selectedFile.rootName || activeRootName }} · {{ selectedFile.path }}</p>
          </div>
        </div>

        <div class="flex-1 min-h-0 flex flex-col">
          <div class="min-h-[180px] overflow-hidden rounded-2xl border border-gray-200/80 dark:border-gray-700/80 bg-gray-50/50 dark:bg-gray-900/40 p-3 ring-1 ring-inset ring-white/35 dark:ring-white/10" :style="{ height: `${rightTopHeight}%` }">
            <div v-if="isSubtitleFile" class="h-full flex flex-col min-h-0">
              <div v-if="pendingSubtitle" class="flex flex-col items-center justify-center flex-1">
                <UIcon name="i-lucide-loader-2" class="w-6 h-6 animate-spin text-sky-500 mb-2" />
                <p class="text-xs text-neutral-500">正在读取字幕内容...</p>
              </div>
              <div v-else-if="subtitlePreview.length" class="relative flex-1 min-h-0">
                <div class="absolute top-0 left-0 right-0 h-3 bg-gradient-to-b from-gray-50/75 dark:from-gray-900/70 to-transparent pointer-events-none z-10" />
                <div class="absolute bottom-0 left-0 right-0 h-2 bg-gradient-to-t from-gray-50/45 dark:from-gray-900/45 to-transparent pointer-events-none z-10" />
                <div class="h-full overflow-y-auto space-y-2 pr-1 custom-scrollbar">
                  <div v-for="entry in subtitlePreview" :key="entry.id" class="p-2.5 rounded-xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700/50 shadow-sm">
                    <div class="flex items-center justify-between mb-1">
                      <span class="text-[10px] font-mono text-sky-500 bg-sky-50 dark:bg-sky-950 px-1.5 py-0.5 rounded leading-none">{{ entry.startTime }}</span>
                      <span class="text-[9px] text-neutral-400">#{{ entry.id }}</span>
                    </div>
                    <p class="text-xs text-gray-700 dark:text-gray-200 whitespace-pre-wrap leading-relaxed">{{ entry.text }}</p>
                  </div>
                  <div v-if="totalSubtitleEntries > subtitlePreview.length" class="py-2 text-center text-[11px] text-gray-400">仅预览前 {{ subtitlePreview.length }} 条，共 {{ totalSubtitleEntries }} 条</div>
                </div>
              </div>
              <div v-else class="flex flex-col items-center justify-center flex-1 text-neutral-400 text-xs">字幕预览为空</div>
            </div>

            <div v-else-if="pendingTracks" class="flex flex-col items-center justify-center h-full">
              <UIcon name="i-lucide-loader-2" class="w-6 h-6 animate-spin text-sky-500 mb-2" />
              <p class="text-xs text-neutral-500">正在分析视频轨道...</p>
            </div>

            <div v-else-if="tracks.length" class="h-full min-h-0 flex flex-col space-y-2">
              <div class="flex items-center justify-between text-[11px] text-gray-500 dark:text-gray-400">
                <span>可用轨道 {{ tracks.filter((t: any) => t.isSupported).length }} / {{ tracks.length }}</span>
                <span v-if="selectedTrackIndex !== null">当前选择 #{{ selectedTrackIndex }}</span>
              </div>
              <div class="flex-1 min-h-0 overflow-y-auto pr-1 custom-scrollbar">
                <URadioGroup v-model="selectedTrackIndex" :items="trackOptions" />
              </div>
            </div>

            <div v-else class="flex flex-col items-center justify-center h-full text-neutral-400 text-xs">
              未发现可处理的文本字幕轨道
            </div>
          </div>

          <div class="w-full h-2 my-2 rounded-full bg-gray-200/80 dark:bg-gray-700/80 hover:bg-primary-300 dark:hover:bg-primary-700 cursor-row-resize transition-colors" :class="{ 'bg-primary-400 dark:bg-primary-600': resizeMode === 'right' }" title="拖动调整上下分区高度" @mousedown.prevent="startResize('right', $event)" />

          <div class="flex-1 min-h-0 pt-2 border-t border-gray-200/90 dark:border-gray-700/90 flex flex-col bg-white/45 dark:bg-gray-900/30 rounded-xl px-2">
            <div class="relative flex-1 min-h-0">
              <div class="h-full overflow-y-auto pr-1 custom-scrollbar space-y-4">
                <div class="space-y-3 p-0.5">

                  <UFormField label="翻译风格">
                    <USelect v-model="options.stylePreset" :items="styleOptions" class="w-full" :ui="{ width: 'w-full' }" :disabled="options.outputMode === 'original'" />
                  </UFormField>
                  <div v-if="currentStyle" class="flex items-start gap-3 p-3 rounded-xl bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-700/50 transition-all">
                    <UIcon :name="currentStyle.icon" class="w-5 h-5 text-primary-500 shrink-0 mt-0.5" />
                    <div class="space-y-0.5 min-w-0">
                      <p class="text-xs font-semibold text-gray-800 dark:text-gray-200">{{ currentStyle.name }}</p>
                      <p class="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">{{ currentStyle.description }}</p>
                    </div>
                  </div>
                  <div class="grid grid-cols-1 gap-3 xl:grid-cols-2">
                    <UFormField label="输出模式">
                      <USelect v-model="options.outputMode" :items="outputModeItems" class="w-full" />
                    </UFormField>
                    <UFormField label="目标语言">
                      <USelect v-model="options.targetLanguage" :items="['zh-CN', 'zh-TW', 'en']" class="w-full" :disabled="options.outputMode === 'original'" />
                    </UFormField>
                  </div>
                  <p v-if="options.outputMode === 'original'" class="text-[11px] text-amber-600 dark:text-amber-400">已选择仅导出原字幕：将跳过 AI 翻译，仅导出所选字幕轨道。</p>
                </div>

                <div class="space-y-3 pt-1" :class="{ 'opacity-70': options.outputMode === 'original' }">

                  <div class="grid grid-cols-1 gap-3 xl:grid-cols-2">
                    <UFormField label="字幕格式">
                      <USelect v-model="options.subtitleFormat" :items="subtitleFormatItems" class="w-full" />
                    </UFormField>
                    <UFormField label="字幕样式">
                      <USelect v-model="options.subtitleStylePreset" :items="subtitleStyleOptions" class="w-full" :disabled="options.outputMode === 'original'" />
                    </UFormField>
                  </div>
                  <UFormField label="双语布局">
                    <USelect v-model="options.bilingualLayout" :items="bilingualLayoutItems" :disabled="options.outputMode !== 'bilingual'" class="w-full" />
                  </UFormField>
                </div>
              </div>
            </div>

            <div class="mt-2 px-2.5 py-2.5 border border-gray-200/85 dark:border-gray-800/80 bg-white/92 dark:bg-gray-900/84 backdrop-blur supports-[backdrop-filter]:bg-white/80 supports-[backdrop-filter]:dark:bg-gray-900/68 rounded-xl shadow-[0_8px_20px_-18px_rgba(15,23,42,0.24)] shrink-0">
              <div class="flex gap-2.5">
                <UButton :label="launching ? '正在加入队列...' : '加入队列'" color="neutral" variant="soft" size="sm" class="flex-1 justify-center" icon="i-lucide-list-plus" :loading="launching" @click="startTask(true)" />
                <UButton :label="launching ? '正在创建任务...' : (options.outputMode === 'original' ? '导出字幕' : '开始翻译')" color="primary" size="sm" class="flex-1 justify-center" icon="i-lucide-sparkles" :loading="launching" @click="startTask(false)" />
              </div>
            </div>
          </div>
        </div>
      </div>

      <div v-else class="h-full flex flex-col items-center justify-center text-center px-6 py-8">
        <div class="max-w-md space-y-4">
          <div class="mx-auto w-fit p-4 bg-gray-50 dark:bg-gray-900 rounded-full">
            <UIcon name="i-lucide-file-video-2" class="w-12 h-12 text-neutral-300" />
          </div>
          <h4 class="text-lg font-medium text-gray-700 dark:text-gray-300">尚未选择文件</h4>
          <p class="text-sm text-neutral-500 leading-relaxed">请先在左侧选择一个视频或字幕文件。</p>
          
        </div>
      </div>
    </div>


    <UModal v-model:open="folderDialogOpen" :title="folderDialogMode === 'create' ? '新建文件夹' : '重命名'" :description="folderDialogMode === 'create' ? '请输入新文件夹名称。' : '请输入新的文件名或目录名。'" :ui="{ width: '!max-w-md w-[92vw]' }">
      <template #content>
        <div class="p-5 space-y-4">
          <div class="rounded-xl border border-gray-100 dark:border-gray-800 bg-gray-50/70 dark:bg-gray-900/40 p-3 text-xs text-gray-500 dark:text-gray-400 break-all">
            {{ folderDialogMode === 'create' ? `创建位置：${activeRootPath}` : `当前对象：${selectedNode?.name || '-'}` }}
          </div>
          <UFormField :label="folderDialogMode === 'create' ? '文件夹名称' : '新名称'" required>
            <UInput v-model="folderDialogValue" :placeholder="folderDialogMode === 'create' ? '例如：Season 2' : '请输入新的名称'" class="w-full" @keyup.enter="submitFolderDialog" />
          </UFormField>
          <div class="flex items-center justify-end gap-3">
            <UButton label="取消" color="neutral" variant="ghost" @click="closeFolderDialog" />
            <UButton :label="folderDialogMode === 'create' ? '创建' : '保存'" color="primary" :loading="folderDialogLoading" @click="submitFolderDialog" />
          </div>
        </div>
      </template>
    </UModal>

    <UModal v-model:open="deleteDialogOpen" title="确认删除" description="删除后不可恢复，请确认是否继续。" :ui="{ width: '!max-w-md w-[92vw]' }">
      <template #content>
        <div class="p-5 space-y-4">
          <div class="flex items-start gap-3 rounded-xl border border-red-100 dark:border-red-900/40 bg-red-50/80 dark:bg-red-950/20 p-3">
            <UIcon name="i-lucide-alert-triangle" class="w-5 h-5 text-red-500 mt-0.5 shrink-0" />
            <div class="space-y-1 min-w-0">
              <p class="text-sm font-medium text-red-700 dark:text-red-300">即将删除：{{ selectedNode?.name || '-' }}</p>
              <p class="text-xs text-red-600/90 dark:text-red-300/80 break-all">此操作将永久删除所选文件或目录，请谨慎确认。</p>
            </div>
          </div>
          <div class="flex items-center justify-end gap-3">
            <UButton label="取消" color="neutral" variant="ghost" @click="deleteDialogOpen = false" />
            <UButton label="确认删除" color="error" :loading="deleteDialogLoading" @click="confirmDeleteNode" />
          </div>
        </div>
      </template>
    </UModal>
  </div>
</template>

<script setup lang="ts">
import { STYLE_PRESETS } from '~~/shared/stylePresets'
import type { FileNode } from '~~/types'

const toast = useToast()
const { data: appConfig } = await useFetch('/api/config')
const activeRootId = ref<string>('')
const searchQuery = ref('')
const selectedFile = ref<FileNode | null>(null)
const selectedNode = ref<FileNode | null>(null)
const layoutRef = ref<HTMLElement | null>(null)
const rightPaneRef = ref<HTMLElement | null>(null)
const leftPaneWidth = ref(50)
const rightTopHeight = ref(48)
const resizeMode = ref<'main' | 'right' | null>(null)
const LAYOUT_STORAGE_KEY = 'subx:file-browser-layout'
const TREE_STATE_STORAGE_KEY = 'subx:file-browser-tree-state'
const folderDialogOpen = ref(false)
const folderDialogMode = ref<'create' | 'rename'>('create')
const folderDialogValue = ref('')
const folderDialogLoading = ref(false)
const deleteDialogOpen = ref(false)
const deleteDialogLoading = ref(false)

const files = ref<FileNode[]>([])
const loadingFiles = ref(false)
const filesError = ref<any>(null)

const rootItems = computed(() => {
  const configured = Array.isArray(appConfig.value?.mediaRoots) ? [...appConfig.value.mediaRoots].filter((root: any) => root.enabled !== false && root.name && root.path).sort((a: any, b: any) => {
    if (a.isDefault === b.isDefault) return (a.order || 0) - (b.order || 0)
    return a.isDefault ? -1 : 1
  }) : []
  if (configured.length) {
    return configured.map((root: any) => ({ label: root.name, value: root.id }))
  }
  return [{ label: '默认媒体库', value: 'default' }]
})

watch(rootItems, async (items) => {
  if (!items.length) return
  const nextRootId = items.find((item: any) => item.value === activeRootId.value)?.value || items[0].value
  if (nextRootId !== activeRootId.value) {
    activeRootId.value = nextRootId
  }
  if (!files.value.length && activeRootId.value) {
    await loadRootNodes()
  }
}, { immediate: true })

const activeRoot = computed(() => rootItems.value.find((item: any) => item.value === activeRootId.value))
const activeRootName = computed(() => activeRoot.value?.label || '默认媒体库')
const activeRootPath = computed(() => {
  const configured = Array.isArray(appConfig.value?.mediaRoots) ? appConfig.value.mediaRoots : []
  return configured.find((root: any) => root.id === activeRootId.value)?.path || '/media'
})

function filterNodes(nodes: FileNode[], keyword: string): FileNode[] {
  if (!keyword) return nodes
  const normalized = keyword.trim().toLowerCase()
  if (!normalized) return nodes

  return nodes
    .map((node) => {
      const children = Array.isArray(node.children) ? filterNodes(node.children, normalized) : []
      const haystack = `${node.name || ''} ${node.path || ''}`.toLowerCase()
      const matched = haystack.includes(normalized)
      if (matched || children.length) {
        return {
          ...node,
          children: node.isDir ? children : node.children
        }
      }
      return null
    })
    .filter(Boolean) as FileNode[]
}

const displayNodes = computed<FileNode[]>(() => filterNodes(files.value || [], searchQuery.value))

const selectedNodeKey = computed(() => {
  if (!selectedNode.value) return ''
  return `${selectedNode.value.rootId || 'default'}:${selectedNode.value.path}`
})

const expandedTreeState = ref<Record<string, string[]>>({})
const expandedNodeKeys = computed(() => expandedTreeState.value[activeRootId.value || 'default'] || [])

const canMutateSelected = computed(() => !!selectedNode.value?.path)


const rootAccessMessage = computed(() => filesError.value?.data?.message || '')
const isRootUnavailable = computed(() => !!filesError.value)

function persistExpandedTreeState() {
  if (!import.meta.client) return
  localStorage.setItem(TREE_STATE_STORAGE_KEY, JSON.stringify(expandedTreeState.value))
}

function setExpandedKeys(rootId: string, keys: string[]) {
  expandedTreeState.value = {
    ...expandedTreeState.value,
    [rootId]: Array.from(new Set(keys))
  }
  persistExpandedTreeState()
}

function buildNodeKey(path: string, rootId?: string) {
  return `${rootId || 'default'}:${path}`
}

function getAncestorKeys(node: FileNode) {
  if (!node.path) return []
  const rootId = node.rootId || activeRootId.value || 'default'
  const segments = node.path.split('/').filter(Boolean)
  const ancestorCount = node.isDir ? segments.length : Math.max(segments.length - 1, 0)
  const keys: string[] = []

  for (let index = 0; index < ancestorCount; index += 1) {
    keys.push(buildNodeKey(segments.slice(0, index + 1).join('/'), rootId))
  }

  return keys
}

function ensureExpandedForNode(node: FileNode) {
  const rootId = node.rootId || activeRootId.value || 'default'
  const keys = [...expandedNodeKeys.value, ...getAncestorKeys(node)]
  setExpandedKeys(rootId, keys)
}

async function toggleDirectory(node: FileNode) {
  if (!node.isDir) return
  const rootId = node.rootId || activeRootId.value || 'default'
  const key = buildNodeKey(node.path, rootId)
  const current = expandedTreeState.value[rootId] || []
  const isOpen = current.includes(key)

  if (isOpen) {
    setExpandedKeys(rootId, current.filter(item => item !== key))
    return
  }

  setExpandedKeys(rootId, [...current, key])
  await loadDirectoryChildren(node)
}

function collapseAllDirectories() {
  const rootId = activeRootId.value || 'default'
  setExpandedKeys(rootId, [])
}


async function loadRootNodes() {
  if (!activeRootId.value) return
  loadingFiles.value = true
  filesError.value = null
  try {
    files.value = await $fetch('/api/files', { query: { rootId: activeRootId.value } })
    await restoreExpandedDirectories(activeRootId.value)
  } catch (e: any) {
    filesError.value = e
    files.value = []
  } finally {
    loadingFiles.value = false
  }
}

function updateNodeTree(nodes: FileNode[], targetPath: string, updater: (node: FileNode) => FileNode): FileNode[] {
  return nodes.map((node) => {
    if (node.path === targetPath) return updater(node)
    if (node.children?.length) {
      return { ...node, children: updateNodeTree(node.children, targetPath, updater) }
    }
    return node
  })
}

function findNodeByPath(nodes: FileNode[], targetPath: string): FileNode | null {
  for (const node of nodes) {
    if (node.path === targetPath) return node
    if (node.children?.length) {
      const matched = findNodeByPath(node.children, targetPath)
      if (matched) return matched
    }
  }
  return null
}

async function loadDirectoryChildren(node: FileNode) {
  if (!node.isDir || node.loaded) return
  const rootId = node.rootId || activeRootId.value
  try {
    const children = await $fetch('/api/files', { query: { rootId, path: node.path } })
    files.value = updateNodeTree(files.value, node.path, current => ({ ...current, children, loaded: true, hasChildren: children.length > 0 }))
  } catch (e: any) {
    toast.add({ title: toastText.error, description: e?.data?.message || '无法加载目录内容', color: 'danger' })
  }
}

async function restoreExpandedDirectories(rootId = activeRootId.value) {
  if (!rootId || !files.value.length) return
  const prefix = rootId + ':'
  const expandedPaths = (expandedTreeState.value[rootId] || [])
    .filter(key => key.startsWith(prefix))
    .map(key => key.slice(prefix.length))
    .filter(Boolean)
    .sort((a, b) => a.split('/').length - b.split('/').length)

  for (const dirPath of expandedPaths) {
    const currentNode = findNodeByPath(files.value, dirPath)
    if (!currentNode?.isDir) continue
    if (currentNode.loaded || currentNode.hasChildren === false) continue
    await loadDirectoryChildren(currentNode)
  }
}

async function handleRootChange() {
  searchQuery.value = ''
  selectedNode.value = null
  selectedFile.value = null
  tracks.value = []
  subtitlePreview.value = []
  totalSubtitleEntries.value = 0
  await loadRootNodes()
}

async function refreshFiles() {
  await loadRootNodes()
  if (filesError.value) {
    toast.add({ title: toastText.error, description: filesError.value.data?.message || '请检查媒体目录挂载和权限', color: 'danger' })
    return
  }
  toast.add({ title: toastText.success, description: '文件列表已刷新', color: 'success' })
}

watch(filesError, (err: any) => {
  if (!err) return
  toast.add({ title: toastText.error, description: err.data?.message || '请检查媒体目录挂载和权限', color: 'danger' })
})

const tracks = ref<any[]>([])
const pendingTracks = ref(false)
const subtitlePreview = ref<any[]>([])
const pendingSubtitle = ref(false)
const totalSubtitleEntries = ref(0)
const selectedTrackIndex = ref<number | null>(null)
const launching = ref(false)
const toastText = {
  success: '成功',
  error: '失败',
}

const styleOptions = STYLE_PRESETS.map(s => ({ label: s.name, value: s.id }))
const outputModeItems = [
  { label: '仅显示译文', value: 'translated' },
  { label: '双语对照', value: 'bilingual' },
  { label: '仅导出原字幕', value: 'original' }
]
const subtitleFormatItems = [
  { label: 'SRT', value: 'srt' },
  { label: 'ASS', value: 'ass' },
  { label: 'SRT + ASS', value: 'both' }
]
const bilingualLayoutItems = [
  { label: '译文在上', value: 'translated_first' },
  { label: '原文在上', value: 'original_first' }
]

const subtitleStyleOptions = computed(() => {
  const common = [{ label: '沿用原样式', value: 'inherit' }]
  if (options.value.outputMode === 'translated' || options.value.outputMode === 'original') {
    return [...common, { label: '单语清爽（推荐）', value: 'mono_clean' }, { label: '单语紧凑', value: 'mono_compact' }]
  }
  return [...common, { label: '简洁双语（推荐）', value: 'bilingual_simple' }, { label: '影院双语', value: 'bilingual_cinema' }, { label: '学习双语', value: 'bilingual_study' }, { label: '单语清爽', value: 'mono_clean' }, { label: '单语紧凑', value: 'mono_compact' }]
})

const options = ref({
  stylePreset: 'default',
  targetLanguage: 'zh-CN',
  outputMode: 'translated',
  subtitleFormat: 'srt',
  subtitleStylePreset: 'bilingual_simple',
  bilingualLayout: 'translated_first'
})

watch(appConfig, (cfg: any) => {
  if (!cfg) return
  options.value = {
    stylePreset: cfg.stylePreset || options.value.stylePreset || 'default',
    targetLanguage: cfg.targetLanguage || options.value.targetLanguage || 'zh-CN',
    outputMode: cfg.outputMode || options.value.outputMode || 'translated',
    subtitleFormat: cfg.subtitleFormat || options.value.subtitleFormat || 'srt',
    subtitleStylePreset: cfg.subtitleStylePreset || options.value.subtitleStylePreset || 'bilingual_simple',
    bilingualLayout: cfg.bilingualLayout || options.value.bilingualLayout || 'translated_first'
  }
}, { immediate: true })

watch(() => options.value.outputMode, (mode) => {
  const allowed = subtitleStyleOptions.value.map(item => item.value)
  if (allowed.includes(options.value.subtitleStylePreset)) return
  options.value.subtitleStylePreset = mode === 'bilingual' ? 'bilingual_simple' : 'mono_clean'
})

const currentStyle = computed(() => STYLE_PRESETS.find(s => s.id === options.value.stylePreset))
const trackOptions = computed(() => tracks.value.map((t: any) => ({
  label: `轨道 #${t.index} (${t.codec}) - ${t.language} ${t.title ? `[${t.title}]` : ''}${!t.isSupported ? ' [全图像字幕/格式不支持]' : ''}`,
  value: t.index,
  disabled: !t.isSupported
})))

const isSubtitleFile = computed(() => {
  if (!selectedFile.value) return false
  const name = selectedFile.value.name.toLowerCase()
  return name.endsWith('.srt') || name.endsWith('.vtt') || name.endsWith('.ass') || name.endsWith('.ssa')
})

async function onSelect(node: FileNode) {
  selectedNode.value = node
  if (node.isDir) {
    selectedFile.value = null
    tracks.value = []
    subtitlePreview.value = []
    return
  }

  const ext = node.name.toLowerCase()
  if (!ext.endsWith('.mkv') && !ext.endsWith('.srt') && !ext.endsWith('.vtt') && !ext.endsWith('.ass') && !ext.endsWith('.ssa')) {
    toast.add({ title: '格式不支持', description: '目前视频仅支持 .mkv 格式，或直接选择 .srt / .vtt / .ass / .ssa 字幕文件。', color: 'amber' })
    return
  }

  selectedFile.value = node
  tracks.value = []
  subtitlePreview.value = []

  if (isSubtitleFile.value) {
    selectedTrackIndex.value = 0
    pendingSubtitle.value = true
    try {
      const res = await $fetch('/api/subtitle-content', { query: { path: node.path, rootId: node.rootId || activeRootId.value } })
      subtitlePreview.value = res.entries
      totalSubtitleEntries.value = res.total
    } finally {
      pendingSubtitle.value = false
    }
    return
  }

  pendingTracks.value = true
  try {
    const res = await $fetch('/api/tracks', { query: { path: node.path, rootId: node.rootId || activeRootId.value } })
    tracks.value = res.tracks
    const firstSupported = tracks.value.find((t: any) => t.isSupported)
    selectedTrackIndex.value = firstSupported ? firstSupported.index : null
  } catch {
    toast.add({ title: toastText.error, description: '无法分析视频轨道', color: 'danger' })
  } finally {
    pendingTracks.value = false
  }
}

function createFolder() {
  folderDialogMode.value = 'create'
  folderDialogValue.value = ''
  folderDialogOpen.value = true
}

function renameNode() {
  if (!selectedNode.value || !selectedNode.value.path) return
  folderDialogMode.value = 'rename'
  folderDialogValue.value = selectedNode.value.name || ''
  folderDialogOpen.value = true
}

function deleteNode() {
  if (!selectedNode.value || !selectedNode.value.path) return
  deleteDialogOpen.value = true
}

function closeFolderDialog(force = false) {
  if (folderDialogLoading.value && !force) return
  folderDialogOpen.value = false
  folderDialogValue.value = ''
}

async function submitFolderDialog() {
  const value = folderDialogValue.value.trim()
  if (!value) {
    toast.add({ title: toastText.error, description: folderDialogMode.value === 'create' ? '请输入文件夹名称' : '请输入新名称', color: 'danger' })
    return
  }

  folderDialogLoading.value = true
  try {
    if (folderDialogMode.value === 'create') {
      const rootId = selectedNode.value?.rootId || activeRootId.value
      const parentPath = selectedNode.value?.isDir ? selectedNode.value.path : selectedNode.value?.path?.split('/').slice(0, -1).join('/') || ''
      await $fetch('/api/files/create-folder', { method: 'POST', body: { parentPath, name: value, rootId } })
      toast.add({ title: toastText.success, description: '文件夹已创建', color: 'success' })
    } else {
      if (!selectedNode.value?.path) return
      if (value === selectedNode.value.name) {
        closeFolderDialog(true)
        return
      }
      await $fetch('/api/files/rename', { method: 'POST', body: { path: selectedNode.value.path, newName: value, rootId: selectedNode.value.rootId || activeRootId.value } })
      toast.add({ title: '重命名成功', description: '名称已更新', color: 'success' })
      selectedNode.value = null
      selectedFile.value = null
      tracks.value = []
      subtitlePreview.value = []
    }
    closeFolderDialog(true)
    await loadRootNodes()
  } catch (e: any) {
    toast.add({ title: toastText.error, description: e?.data?.message || (folderDialogMode.value === 'create' ? '无法创建文件夹' : '无法重命名'), color: 'danger' })
  } finally {
    folderDialogLoading.value = false
  }
}

async function confirmDeleteNode() {
  if (!selectedNode.value || !selectedNode.value.path) return
  deleteDialogLoading.value = true
  try {
    await $fetch('/api/files/delete', { method: 'POST', body: { path: selectedNode.value.path, rootId: selectedNode.value.rootId || activeRootId.value } })
    toast.add({ title: '删除成功', description: '所选内容已删除', color: 'success' })
    deleteDialogOpen.value = false
    selectedNode.value = null
    selectedFile.value = null
    tracks.value = []
    subtitlePreview.value = []
    await loadRootNodes()
  } catch (e: any) {
    toast.add({ title: toastText.error, description: e?.data?.message || '无法删除目标', color: 'danger' })
  } finally {
    deleteDialogLoading.value = false
  }
}

async function startTask(silent = false) {
  if (!selectedFile.value) return
  if (selectedTrackIndex.value === null && !isSubtitleFile.value) return
  launching.value = true
  try {
    const res = await $fetch('/api/task', {
      method: 'POST',
      body: {
        filePath: selectedFile.value.path,
        rootId: selectedFile.value.rootId || activeRootId.value,
        sourceType: isSubtitleFile.value ? 'external' : 'embedded',
        trackIndex: isSubtitleFile.value ? 0 : selectedTrackIndex.value,
        ...options.value
      }
    })
    toast.add({ title: silent ? '已加入队列' : '任务已创建', description: silent ? '可前往「任务历史」查看进度' : '正在打开任务详情', color: 'success' })
    if (silent) {
      selectedFile.value = null
      tracks.value = []
      subtitlePreview.value = []
    } else {
      navigateTo(`/task/${res.taskId}`)
    }
  } catch (e: any) {
    toast.add({ title: '创建失败', description: e?.data?.message || e?.message || '无法开始翻译任务', color: 'danger' })
  } finally {
    launching.value = false
  }
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function startResize(mode: 'main' | 'right') {
  resizeMode.value = mode
}

function handleResize(event: MouseEvent) {
  if (!resizeMode.value) return
  if (resizeMode.value === 'main' && layoutRef.value) {
    const rect = layoutRef.value.getBoundingClientRect()
    const percent = ((event.clientX - rect.left) / rect.width) * 100
    leftPaneWidth.value = clamp(percent, 34, 66)
    return
  }
  if (resizeMode.value === 'right' && rightPaneRef.value) {
    const rect = rightPaneRef.value.getBoundingClientRect()
    const headerOffset = 56
    const usable = rect.height - headerOffset
    const topPx = event.clientY - rect.top - headerOffset
    const percent = (topPx / usable) * 100
    rightTopHeight.value = clamp(percent, 30, 70)
  }
}

function stopResize() {
  persistLayout()
  resizeMode.value = null
}

function resetLayout() {
  leftPaneWidth.value = 50
  rightTopHeight.value = 48
  persistLayout()
}

function persistLayout() {
  if (!import.meta.client) return
  localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify({ leftPaneWidth: leftPaneWidth.value, rightTopHeight: rightTopHeight.value }))
}

const resizeHint = computed(() => {
  if (resizeMode.value === 'main') {
    const left = Math.round(leftPaneWidth.value)
    return `左右布局：${left}% / ${100 - left}%`
  }
  if (resizeMode.value === 'right') {
    const top = Math.round(rightTopHeight.value)
    return `上下布局：${top}% / ${100 - top}%`
  }
  return ''
})

onMounted(async () => {
  if (import.meta.client) {
    const raw = localStorage.getItem(LAYOUT_STORAGE_KEY)
    if (raw) {
      try {
        const parsed = JSON.parse(raw)
        if (typeof parsed.leftPaneWidth === 'number') leftPaneWidth.value = clamp(parsed.leftPaneWidth, 34, 66)
        if (typeof parsed.rightTopHeight === 'number') rightTopHeight.value = clamp(parsed.rightTopHeight, 30, 70)
      } catch {
        // ignore invalid cache
      }
    }

    const treeStateRaw = localStorage.getItem(TREE_STATE_STORAGE_KEY)
    if (treeStateRaw) {
      try {
        const parsed = JSON.parse(treeStateRaw)
        if (parsed && typeof parsed === 'object') {
          expandedTreeState.value = Object.fromEntries(
            Object.entries(parsed).map(([rootId, keys]) => [rootId, Array.isArray(keys) ? keys.filter(item => typeof item === 'string') : []])
          )
        }
      } catch {
        // ignore invalid cache
      }
    }

    if (activeRootId.value && files.value.length) {
      await restoreExpandedDirectories(activeRootId.value)
    }
  }
  window.addEventListener('mousemove', handleResize)
  window.addEventListener('mouseup', stopResize)
})

onBeforeUnmount(() => {
  window.removeEventListener('mousemove', handleResize)
  window.removeEventListener('mouseup', stopResize)
})
</script>
