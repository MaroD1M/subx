<template>
  <nav aria-label="主导航" class="fixed inset-x-0 bottom-0 z-40 border-t border-gray-200/80 bg-white/95 px-2 pb-[env(safe-area-inset-bottom)] backdrop-blur-md dark:border-gray-800 dark:bg-gray-950/95 xl:hidden">
    <div class="mx-auto grid max-w-xl gap-1 py-1" :style="{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }">
      <NuxtLink
        v-for="item in items"
        :key="item.to"
        :to="item.to"
        prefetch-on="interaction"
        :aria-current="isActive(item.to) ? 'page' : undefined"
        class="relative flex min-h-16 min-w-0 flex-col items-center justify-center gap-1 rounded-lg px-1 text-[11px] font-medium leading-4 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/50"
        :class="isActive(item.to) ? 'text-primary-700 dark:text-primary-300' : 'text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100'"
      >
        <span
          v-if="isActive(item.to)"
          aria-hidden="true"
          class="absolute inset-x-4 top-0 h-0.5 rounded-full bg-primary-600 dark:bg-primary-400"
        />
        <span
          class="flex h-7 w-9 items-center justify-center rounded-lg transition-colors"
          :class="isActive(item.to) ? 'bg-primary-50 dark:bg-primary-500/10' : ''"
        >
          <UIcon :name="item.icon" class="h-5 w-5" />
        </span>
        <span class="max-w-full truncate whitespace-nowrap">{{ item.shortLabel || item.label }}</span>
      </NuxtLink>
    </div>
  </nav>
</template>

<script setup lang="ts">
const { navItems: items, isActive } = useNavigation()
</script>
