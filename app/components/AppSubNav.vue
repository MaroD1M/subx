<template>
  <nav :aria-label="label" class="overflow-x-auto rounded-xl border border-gray-200/80 bg-white p-1 shadow-sm dark:border-gray-800 dark:bg-gray-950/60">
    <div class="flex min-w-max items-center gap-1">
      <button
        v-for="item in items"
        :key="item.value"
        type="button"
        class="flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors"
        :class="modelValue === item.value
          ? 'bg-primary-50 text-primary-700 shadow-sm dark:bg-primary-500/10 dark:text-primary-300'
          : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-gray-900 dark:hover:text-white'"
        :aria-current="modelValue === item.value ? 'page' : undefined"
        @click="emit('update:modelValue', item.value)"
      >
        <UIcon v-if="item.icon" :name="item.icon" class="h-4 w-4 shrink-0" />
        <span>{{ item.label }}</span>
      </button>
    </div>
  </nav>
</template>

<script setup lang="ts">
defineProps<{
  modelValue: string
  items: Array<{ label: string, value: string, icon?: string }>
  label?: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()
</script>
