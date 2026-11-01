<template>
  <div class="flex flex-col gap-4 border-b border-gray-200/80 pb-4 dark:border-gray-800 md:flex-row md:items-end md:justify-between">
    <div class="min-w-0 space-y-2">
      <UBreadcrumb v-if="breadcrumb?.length" :links="breadcrumb" />
      <h1 class="text-2xl font-bold tracking-tight text-gray-900 dark:text-white sm:text-3xl">{{ title }}</h1>
      <p v-if="description" class="max-w-2xl text-sm leading-6 text-gray-500 dark:text-gray-400">{{ description }}</p>
    </div>
    <div v-if="$slots.actions" class="flex flex-wrap items-center gap-2 md:justify-end">
      <slot name="actions" />
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  title: string
  description?: string
  breadcrumb?: Array<{ label: string, icon?: string, to?: string }>
}>()
</script>
