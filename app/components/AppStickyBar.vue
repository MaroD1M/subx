<template>
  <div class="sticky bottom-4 z-20 rounded-2xl border border-gray-200/80 bg-white/95 p-3 shadow-lg backdrop-blur dark:border-gray-800/80 dark:bg-gray-950/90">
    <div class="flex flex-col gap-3 sm:flex-row sm:items-center">
      <div class="min-w-0 flex-1">
        <slot name="info" />
      </div>
      <div class="flex flex-wrap items-center justify-end gap-2 sm:ml-auto">
        <slot name="actions" />
      </div>
    </div>
  </div>
</template>
