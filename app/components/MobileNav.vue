<template>
  <nav aria-label="主导航" class="fixed inset-x-0 bottom-0 z-40 border-t border-gray-200/80 bg-white/95 px-2 pb-[env(safe-area-inset-bottom)] backdrop-blur-md dark:border-gray-800 dark:bg-gray-950/95 xl:hidden">
    <div class="mx-auto grid max-w-lg grid-cols-5">
      <NuxtLink
        v-for="item in items"
        :key="item.to"
        :to="item.to"
        prefetch-on="interaction"
        :aria-current="isActive(item.to) ? 'page' : undefined"
        class="flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl px-1 text-xs font-medium transition-colors"
        :class="isActive(item.to) ? 'text-primary-700 dark:text-primary-400' : 'text-gray-500 dark:text-gray-400'"
      >
        <UIcon :name="item.icon" class="h-5 w-5" />
        <span>{{ item.shortLabel || item.label }}</span>
      </NuxtLink>
    </div>
  </nav>
</template>

<script setup lang="ts">
const { navItems: items, isActive } = useNavigation()
</script>
