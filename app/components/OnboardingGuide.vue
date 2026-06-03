<template>
  <div />
</template>

<script setup lang="ts">
defineProps<{
  config?: any
  open?: boolean
}>()

defineEmits<{
  (e: 'open-settings'): void
  (e: 'update:open', value: boolean): void
}>()
</script>
