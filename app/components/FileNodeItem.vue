<template>
  <div class="px-1">
    <div
      class="relative flex items-center gap-2 rounded-lg cursor-pointer transition-colors duration-200"
      :class="[
        isSelected
          ? 'bg-primary-100 dark:bg-primary-900/40 ring-1 ring-primary-300 dark:ring-primary-700 text-primary-700 dark:text-primary-200 shadow-sm'
          : (node.isDir
            ? 'text-gray-600 dark:text-gray-400 font-medium hover:bg-gray-50 dark:hover:bg-gray-800/40'
            : 'text-gray-500 dark:text-gray-400 hover:bg-primary-50 hover:text-primary-600 dark:hover:bg-primary-900/30')
      ]"
      :style="{ paddingLeft: `${indentPx}px`, paddingRight: '0.75rem', paddingTop: '0.5rem', paddingBottom: '0.5rem' }"
      :title="fullLabel"
      @click="handleClick"
    >
      <span
        v-if="isSelected"
        class="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-0.5 rounded-full bg-primary-500"
      />
      <UIcon
        v-if="node.isDir"
        :name="isOpen ? 'i-lucide-folder-open' : 'i-lucide-folder'"
        class="w-4 h-4 shrink-0"
      />
      <UIcon v-else :name="fileIcon" class="w-4 h-4 shrink-0" />
      <div class="min-w-0 flex-1">
        <span class="block text-sm truncate" :title="node.name">{{ displayName }}</span>
        <span v-if="showSecondaryPath" class="block text-[10px] text-gray-400 dark:text-gray-500 truncate" :title="node.path">{{ node.path }}</span>
      </div>
    </div>

    <div v-if="isOpen && node.isDir" class="ml-3 mt-1 space-y-1 border-l border-gray-100 dark:border-gray-800">
      <div v-if="node.hasChildren && !node.loaded" class="px-3 py-2 text-xs text-gray-400 dark:text-gray-500">加载中...</div>
      <div v-else-if="node.loaded && !node.children?.length" class="px-3 py-2 text-xs text-gray-400 dark:text-gray-500">空目录</div>
      <template v-for="child in node.children" :key="`${child.rootId || 'default'}:${child.path}`">
        <FileNodeItem
          :node="child"
          :selected-path="selectedPath"
          :expanded-keys="expandedKeys"
          :depth="depth + 1"
          @select="$emit('select', $event)"
          @toggle-dir="$emit('toggle-dir', $event)"
        />
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
const props = defineProps({
  node: { type: Object, required: true },
  selectedPath: { type: String, default: '' },
  expandedKeys: { type: Array as () => string[], default: () => [] },
  depth: { type: Number, default: 0 }
})
const emit = defineEmits(['select', 'toggle-dir'])

const nodeKey = computed(() => `${props.node.rootId || 'default'}:${props.node.path || ''}`)
const isSelected = computed(() => !!props.selectedPath && props.selectedPath === nodeKey.value)
const isOpen = computed(() => props.node.isDir && props.expandedKeys.includes(nodeKey.value))
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
</script>
