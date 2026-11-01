<template>
  <div :class="containerClass">
    <slot />
  </div>
</template>

<script setup lang="ts">
const props = withDefaults(defineProps<{ size?: 'wide' | 'default' | 'narrow' }>(), {
  size: 'wide'
})

const containerClass = computed(() => {
  const width = props.size === 'narrow'
    ? 'max-w-[960px]'
    : props.size === 'default'
      ? 'max-w-[1200px]'
      : 'max-w-[1440px]'
  return `${width} mx-auto w-full`
})
</script>
