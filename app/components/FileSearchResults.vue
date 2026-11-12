<template>
  <div v-if="loading" class="flex min-h-[160px] items-center justify-center gap-2 text-xs text-gray-500 dark:text-gray-400">
    <UIcon name="i-lucide-loader-2" class="h-4 w-4 animate-spin text-primary-500" />
    正在搜索整个媒体库...
  </div>
  <div v-else-if="error" class="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700 dark:border-red-900/50 dark:bg-red-950/20 dark:text-red-300">
    {{ error }}
  </div>
  <template v-else>
    <button
      v-for="item in results"
      :key="itemKey(item)"
      type="button"
      class="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors hover:bg-primary-50 dark:hover:bg-primary-950/30"
      @click="emit('select', item)"
    >
      <UIcon :name="isSubtitle(item.name) ? 'i-lucide-file-text' : 'i-lucide-file-video'" class="h-4 w-4 shrink-0" :class="isSubtitle(item.name) ? 'text-primary-500' : 'text-gray-400'" />
      <div class="min-w-0 flex-1">
        <p class="truncate text-sm text-gray-700 dark:text-gray-200">{{ item.name }}</p>
        <p class="truncate text-xs text-gray-500 dark:text-gray-400">{{ item.path }}</p>
      </div>
    </button>
    <div v-if="!results.length" class="flex min-h-[160px] items-center justify-center text-center text-xs text-gray-500 dark:text-gray-400">
      整个媒体库中没有匹配的文件
    </div>
    <p v-if="truncated" class="px-3 py-2 text-xs text-amber-600 dark:text-amber-400">结果过多，仅显示前 {{ results.length }} 个匹配文件。</p>
  </template>
</template>

<script setup lang="ts">
import type { FileNode } from '~~/types'

defineProps<{
  results: FileNode[]
  loading?: boolean
  error?: string
  truncated?: boolean
}>()

const emit = defineEmits<{ select: [item: FileNode] }>()

function isSubtitle(name: string) {
  return /\.(srt|ass|ssa|vtt)$/i.test(String(name || ''))
}

function itemKey(item: FileNode) {
  return `${item.rootId || 'default'}:${item.path}`
}
</script>
