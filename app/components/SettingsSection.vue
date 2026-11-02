<template>
  <section class="surface-card p-4 sm:p-5">
    <header class="flex flex-col gap-3 border-b border-gray-100 pb-3 dark:border-gray-800 sm:flex-row sm:items-start sm:justify-between">
      <div class="min-w-0">
        <h2 class="app-section-title">{{ title }}</h2>
        <p v-if="description" class="mt-1 app-caption">{{ description }}</p>
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
