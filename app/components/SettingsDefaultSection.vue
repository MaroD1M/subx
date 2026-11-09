<template>
  <div class="space-y-4">
    <SettingsSection title="默认翻译行为" description="这些设置会作为新任务的默认值。">
      <div class="space-y-4">
        <div class="grid grid-cols-1 gap-3 md:grid-cols-2">
          <UFormField label="目标语言">
            <USelect :model-value="config.targetLanguage" :items="languageOptions" class="w-full" @update:model-value="patch('targetLanguage', $event)" />
          </UFormField>
          <UFormField label="输出模式">
            <USelect :model-value="config.outputMode" :items="outputModeItems" class="w-full" @update:model-value="patch('outputMode', $event)" />
          </UFormField>
        </div>

        <UFormField label="翻译模式">
          <USelect :model-value="config.translationMode" :items="translationModeItems" class="w-full" @update:model-value="patch('translationMode', $event)" />
        </UFormField>

        <div class="flex items-center justify-between gap-3 rounded-xl border border-gray-100 bg-gray-50/70 p-3 dark:border-gray-800 dark:bg-gray-900/40">
          <div class="space-y-0.5">
            <p class="text-sm font-medium text-gray-700 dark:text-gray-300">Emby 兼容输出</p>
            <p class="text-xs leading-5 text-gray-500 dark:text-gray-400">媒体目录只放一个主字幕，语言变体同步到 SubX/ 子目录。</p>
          </div>
          <USwitch :model-value="config.embyCompatibleOutput" aria-label="启用 Emby 兼容输出" @update:model-value="patch('embyCompatibleOutput', $event)" />
        </div>

        <div class="rounded-2xl border border-gray-200/80 p-3 dark:border-gray-800 space-y-3">
          <div class="flex items-center justify-between gap-3">
            <div>
              <p class="text-sm font-medium text-gray-700 dark:text-gray-300">双模型质量校验</p>
              <p class="text-xs leading-5 text-gray-500 dark:text-gray-400">翻译完成后用第二个模型逐条评分，低分条目自动进入核对。</p>
            </div>
            <USwitch :model-value="config.qualityCheckEnabled" aria-label="启用双模型质量校验" @update:model-value="patch('qualityCheckEnabled', $event)" />
          </div>
          <div v-if="config.qualityCheckEnabled" class="grid gap-3 md:grid-cols-3">
            <UFormField label="校验模型">
              <UInput :model-value="config.qualityCheckModel" placeholder="例如 gpt-4o-mini" class="w-full" @update:model-value="patch('qualityCheckModel', $event)" />
            </UFormField>
            <UFormField label="低分阈值">
              <UInput :model-value="qualityThresholdPercent" type="number" min="0" max="100" class="w-full" @update:model-value="emit('update:qualityThresholdPercent', $event)">
                <template #trailing><span class="text-xs text-gray-400">%</span></template>
              </UInput>
            </UFormField>
            <UFormField label="最多校验条数">
              <UInput :model-value="config.qualityCheckMaxEntries" type="number" min="1" max="1000" class="w-full" @update:model-value="patch('qualityCheckMaxEntries', toNumber($event))" />
            </UFormField>
          </div>
          <p v-if="config.qualityCheckEnabled && config.qualityCheckModel && config.qualityCheckModel === config.defaultModel" class="text-xs text-amber-700 dark:text-amber-300">校验模型与主翻译模型相同，不构成双模型校验。</p>
        </div>

        <div class="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <UFormField label="分块大小">
            <UInputNumber :model-value="config.chunkSize" :min="100" :max="50000" :step="100" class="w-full" @update:model-value="patch('chunkSize', $event)" />
          </UFormField>
          <UFormField label="并发任务数">
            <UInputNumber :model-value="config.concurrency" :min="1" :max="10" class="w-full" @update:model-value="patch('concurrency', $event)" />
          </UFormField>
          <UFormField label="最大重试次数">
            <UInputNumber :model-value="config.maxRetries" :min="0" :max="5" class="w-full" @update:model-value="patch('maxRetries', $event)" />
          </UFormField>
          <UFormField label="日志保留天数">
            <UInputNumber :model-value="config.logRetentionDays" :min="1" :max="30" class="w-full" @update:model-value="patch('logRetentionDays', $event)" />
          </UFormField>
        </div>
        <p class="text-xs leading-5 text-gray-500 dark:text-gray-400">分块大小按估算 Token 计算，范围 100-50000。模型上下文较大时可适当提高。</p>
      </div>
    </SettingsSection>
  </div>
</template>

<script setup lang="ts">
interface Props {
  config: Record<string, any>
  languageOptions: Array<{ label: string, value: string }>
  outputModeItems: Array<{ label: string, value: string }>
  translationModeItems: Array<{ label: string, value: string }>
  qualityThresholdPercent: number
}

defineProps<Props>()

const emit = defineEmits<{
  'update:config': [patch: Record<string, any>]
  'update:qualityThresholdPercent': [value: any]
}>()

function patch(field: string, value: any) {
  emit('update:config', { [field]: value })
}

function toNumber(value: any) {
  const parsed = parseFloat(value)
  return Number.isNaN(parsed) ? value : parsed
}
</script>
