<template>
  <div class="px-1">
    <div
      class="relative flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-colors duration-200"
      :class="[
        isSelected
          ? 'bg-primary-50 dark:bg-primary-900/30 ring-1 ring-primary-200 dark:ring-primary-700 text-primary-700 dark:text-primary-300'
          : (node.isDir
            ? 'text-gray-600 dark:text-gray-400 font-medium hover:bg-gray-50 dark:hover:bg-gray-800/40'
            : 'text-gray-500 dark:text-gray-500 hover:bg-primary-50 hover:text-primary-600 dark:hover:bg-primary-900/30')
      ]"
      @click="toggle"
    >
      <span
        v-if="isSelected"
        class="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-0.5 rounded-full bg-primary-500"
      />
      <UIcon
        v-if="node.isDir"
        :name="isOpen ? 'i-lucide-folder-open' : 'i-lucide-folder'"
        class="w-4 h-4"
      />
      <UIcon v-else :name="fileIcon" class="w-4 h-4" />
      <span class="text-sm truncate">{{ node.name }}</span>
    </div>

    <div v-if="isOpen && node.isDir" class="pl-4 border-l border-gray-100 dark:border-gray-800 ml-5 mt-1 space-y-1">
      <template v-for="child in node.children" :key="child.path">
        <FileNodeItem :node="child" :selected-path="selectedPath" @select="$emit('select', $event)" />
      </template>
    </div>
  </div>
</template>

<script setup>
const props = defineProps({
  node: { type: Object, required: true },
  selectedPath: { type: String, default: '' }
})
const emit = defineEmits(['select'])

const isOpen = ref(false)
const isSelected = computed(() => props.selectedPath && props.selectedPath === props.node.path)
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

function toggle() {
  emit('select', props.node)
  if (props.node.isDir) {
    isOpen.value = !isOpen.value
  }
}
</script>
