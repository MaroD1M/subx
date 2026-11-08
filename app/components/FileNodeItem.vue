<template>
  <div class="px-1">
    <div
      class="relative flex items-center gap-2 rounded-lg cursor-pointer transition-colors duration-200"
      :class="[
        isSelected
          ? 'bg-primary-100 dark:bg-primary-900/40 ring-1 ring-primary-300 dark:ring-primary-700 text-primary-700 dark:text-primary-200 shadow-sm'
          : (node.isDir
            ? 'text-gray-600 dark:text-gray-400 font-medium hover:bg-gray-50 dark:hover:bg-gray-800/40'
            : 'text-gray-500 dark:text-gray-400 hover:bg-primary-50 hover:text-primary-800 dark:hover:bg-primary-900/30')
      ]"
      :style="{ paddingLeft: `${indentPx}px`, paddingRight: '0.75rem', paddingTop: '0.625rem', paddingBottom: '0.625rem' }"
      :title="fullLabel"
      role="treeitem"
      :aria-expanded="node.isDir ? isOpen : undefined"
      :aria-selected="isSelected"
      :aria-label="fullLabel"
      :aria-level="depth + 1"
      :tabindex="activeKey && activeKey !== nodeKey ? -1 : 0"
      @click="handleClick"
      @keydown="handleKeydown"
    >
      <span
        v-if="isSelected"
        class="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-0.5 rounded-full bg-primary-500"
      />
      <UCheckbox
        v-if="selectable"
        :model-value="checkboxValue"
        :disabled="isFolderScanning"
        :aria-label="node.isDir ? `选择目录 ${node.name} 内的全部视频` : `选择 ${node.name}`"
        :title="node.isDir ? '选择目录内全部视频；外挂字幕不会单独入队' : undefined"
        class="shrink-0"
        @click.stop
        @keydown.stop
        @update:model-value="$emit('toggle-select', node)"
      />
      <UIcon
        v-if="node.isDir && isFolderScanning"
        name="i-lucide-loader-2"
        class="w-4 h-4 shrink-0 animate-spin text-primary-500"
      />
      <UIcon
        v-else-if="node.isDir"
        :name="isOpen ? 'i-lucide-folder-open' : 'i-lucide-folder'"
        class="w-4 h-4 shrink-0"
      />
      <UIcon v-else :name="fileIcon" class="w-4 h-4 shrink-0" />
      <div class="min-w-0 flex-1">
        <span class="block text-sm truncate" :title="node.name">{{ displayName }}</span>
        <span v-if="showSecondaryPath" class="block text-[11px] text-gray-400 dark:text-gray-500 truncate" :title="node.path">{{ node.path }}</span>
      </div>
    </div>

    <div v-if="isOpen && node.isDir" role="group" class="ml-3 mt-1 space-y-1 border-l border-gray-100 dark:border-gray-800">
      <div v-if="node.hasChildren && !node.loaded" class="px-3 py-2 text-xs text-gray-400 dark:text-gray-500">加载中...</div>
      <div v-else-if="node.loaded && !node.children?.length" class="px-3 py-2 text-xs text-gray-400 dark:text-gray-500">空目录</div>
      <template v-for="child in node.children" :key="`${child.rootId || 'default'}:${child.path}`">
        <FileNodeItem
          :node="child"
          :selected-path="selectedPath"
          :active-key="activeKey"
          :expanded-keys="expandedKeys"
          :selectable="selectable"
          :selected-keys="selectedKeys"
          :folder-totals="folderTotals"
          :folder-selected-counts="folderSelectedCounts"
          :scanning-keys="scanningKeys"
          :depth="depth + 1"
          @select="$emit('select', $event)"
          @toggle-dir="$emit('toggle-dir', $event)"
          @toggle-select="$emit('toggle-select', $event)"
        />
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
const props = defineProps({
  node: { type: Object, required: true },
  selectedPath: { type: String, default: '' },
  activeKey: { type: String, default: '' },
  expandedKeys: { type: Array as () => string[], default: () => [] },
  selectable: { type: Boolean, default: false },
  selectedKeys: { type: Object as () => Set<string>, default: () => new Set<string>() },
  folderTotals: { type: Object as () => Record<string, number>, default: () => ({}) },
  folderSelectedCounts: { type: Object as () => Record<string, number>, default: () => ({}) },
  scanningKeys: { type: Array as () => string[], default: () => [] },
  searchActive: { type: Boolean, default: false },
  depth: { type: Number, default: 0 }
})
const emit = defineEmits(['select', 'toggle-dir', 'toggle-select'])

const nodeKey = computed(() => `${props.node.rootId || 'default'}:${props.node.path || ''}`)
const isSelected = computed(() => !!props.selectedPath && props.selectedPath === nodeKey.value)
const isChecked = computed(() => props.selectedKeys.has(nodeKey.value))
const isOpen = computed(() => props.node.isDir && (props.expandedKeys.includes(nodeKey.value) || (props.searchActive && Boolean(props.node.children?.length))))
const VIDEO_EXTENSIONS = ['.mkv', '.mp4', '.avi', '.webm', '.ts', '.m2ts', '.mts', '.mov']

function pathFromKey(key: string) {
  const separator = key.indexOf(':')
  return separator >= 0 ? key.slice(separator + 1) : key
}

function countLoadedVideos(node: any): number {
  if (!node) return 0
  if (!node.isDir) {
    return node.name && VIDEO_EXTENSIONS.some((extension: string) => String(node.name).toLowerCase().endsWith(extension)) ? 1 : 0
  }
  if (!node.loaded) return 0
  return (node.children || []).reduce((total: number, child: any) => total + countLoadedVideos(child), 0)
}

function treeFullyLoaded(node: any): boolean {
  if (!node?.isDir) return true
  if (!node.loaded) return false
  return (node.children || []).every((child: any) => !child.isDir || treeFullyLoaded(child))
}

const folderTotal = computed<number | null>(() => {
  const scanned = props.folderTotals[nodeKey.value]
  if (typeof scanned === 'number') return scanned
  return treeFullyLoaded(props.node) ? countLoadedVideos(props.node) : null
})
const selectedVideoCount = computed(() => {
  if (!props.node.isDir) return 0
  return props.folderSelectedCounts[nodeKey.value] || 0
})
const isFolderChecked = computed(() => props.node.isDir && folderTotal.value !== null && folderTotal.value > 0 && selectedVideoCount.value >= folderTotal.value)
const isFolderIndeterminate = computed(() => props.node.isDir && selectedVideoCount.value > 0 && !isFolderChecked.value)
const isFolderScanning = computed(() => props.node.isDir && props.scanningKeys.includes(nodeKey.value))
const checkboxValue = computed(() => {
  if (!props.node.isDir) return isChecked.value
  return isFolderIndeterminate.value ? 'indeterminate' : isFolderChecked.value
})
const indentPx = computed(() => 12 + props.depth * 12)
const fullLabel = computed(() => props.node?.path || props.node?.name || '')
const showSecondaryPath = computed(() => !!props.node?.path && props.depth >= 2)

const displayName = computed(() => {
  const name = String(props.node?.name || '')
  if (name.length <= 36) return name
  return middleEllipsis(name, 18, 12)
})

const fileIcon = computed(() => {
  const name = props.node?.name?.toLowerCase?.() || ''
  if (name.endsWith('.srt') || name.endsWith('.vtt') || name.endsWith('.ass') || name.endsWith('.ssa')) {
    return 'i-lucide-file-text'
  }
  if (name.endsWith('.mkv') || name.endsWith('.mp4') || name.endsWith('.mov')) {
    return 'i-lucide-file-video'
  }
  return 'i-lucide-file'
})

function middleEllipsis(text: string, head = 16, tail = 10) {
  if (text.length <= head + tail + 1) return text
  return `${text.slice(0, head)}…${text.slice(-tail)}`
}

function handleClick() {
  emit('select', props.node)
  if (props.node.isDir) {
    emit('toggle-dir', props.node)
  }
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault()
    handleClick()
    return
  }
  if (!props.node.isDir) return
  if (event.key === 'ArrowRight' && !isOpen.value) {
    event.preventDefault()
    emit('toggle-dir', props.node)
  } else if (event.key === 'ArrowLeft' && isOpen.value) {
    event.preventDefault()
    emit('toggle-dir', props.node)
  }
}
</script>
