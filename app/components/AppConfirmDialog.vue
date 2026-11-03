<template>
  <UModal
    :open="Boolean(state)"
    :title="state?.title || '确认操作'"
    @update:open="value => { if (!value) resolve(false) }"
  >
    <template #content>
      <div class="space-y-4 p-5">
        <div class="rounded-xl border border-amber-100 bg-amber-50/80 p-3 text-sm leading-6 text-amber-700 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-300">
          {{ state?.description || '此操作不可撤销，请确认是否继续。' }}
        </div>
        <div class="flex items-center justify-end gap-3">
          <UButton :label="state?.cancelLabel || '取消'" color="neutral" variant="ghost" @click="resolve(false)" />
          <UButton :label="state?.confirmLabel || '确认'" :color="state?.color || 'error'" @click="resolve(true)" />
        </div>
      </div>
    </template>
  </UModal>
</template>

<script setup lang="ts">
const { state, resolve } = useConfirm()
</script>
