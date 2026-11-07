<template>
  <div data-preview-static class="sticky bottom-[calc(4rem+env(safe-area-inset-bottom))] z-30 rounded-2xl xl:bottom-4 border border-gray-200/80 bg-white/95 p-3 shadow-lg backdrop-blur dark:border-gray-800/80 dark:bg-gray-950/90">
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
