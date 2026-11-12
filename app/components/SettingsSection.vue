<template>
  <section class="app-section">
    <header class="app-section-head">
      <div class="min-w-0">
        <h2 class="app-section-title">{{ title }}</h2>
        <p v-if="description" class="mt-1 app-caption">{{ description }}</p>
      </div>
      <div v-if="$slots.actions" class="flex shrink-0 flex-wrap items-center gap-2">
        <slot name="actions" />
      </div>
    </header>
    <div class="app-section-body">
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
