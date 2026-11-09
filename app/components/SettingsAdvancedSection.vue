<template>
  <div class="space-y-4">
    <SettingsSection title="高级设置" description="仅在需要兼容性排查时使用。">
      <div class="rounded-xl border border-gray-100 bg-gray-50/70 p-4 dark:border-gray-800 dark:bg-gray-900/40" :class="config.translationMode !== 'stream' ? 'opacity-60' : ''">
        <div class="flex items-center justify-between gap-3">
          <div class="space-y-0.5">
            <p class="text-sm font-medium text-gray-700 dark:text-gray-300">流式用量统计</p>
            <p class="text-xs leading-5 text-gray-500 dark:text-gray-400">仅在流式模式下生效，兼容性较弱，默认建议关闭。</p>
          </div>
          <USwitch :model-value="config.streamUsage" :disabled="config.translationMode !== 'stream'" @update:model-value="emit('update:config', { streamUsage: $event })" @click.stop />
        </div>
      </div>
      <p class="mt-3 text-xs leading-5 text-gray-500 dark:text-gray-400">日志保留天数会同时影响任务日志、AI 日志、临时文件和翻译缓存清理。</p>
    </SettingsSection>
  </div>
</template>

<script setup lang="ts">
interface Props {
  config: Record<string, any>
}

defineProps<Props>()

const emit = defineEmits<{
  'update:config': [patch: Record<string, any>]
}>()
</script>
