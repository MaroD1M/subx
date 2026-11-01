<template>
  <section class="rounded-2xl border border-gray-200/80 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-950/60 sm:p-5">
    <header class="flex flex-col gap-3 border-b border-gray-100 pb-3 dark:border-gray-800 sm:flex-row sm:items-start sm:justify-between">
      <div class="min-w-0">
        <h2 class="text-sm font-semibold text-gray-900 dark:text-white">{{ title }}</h2>
        <p v-if="description" class="mt-1 text-xs leading-5 text-gray-500 dark:text-gray-400">{{ description }}</p>
      </div>
      <div v-if="$slots.actions" class="flex shrink-0 flex-wrap items-center gap-2">
        <slot name="actions" />
      </div>
    </header>
    <div class="pt-4">
      <slot />
    </div>
  </section>
</template>

<script setup lang="ts">
defineProps<{
  title: string
  description?: string
}>()
</script>
