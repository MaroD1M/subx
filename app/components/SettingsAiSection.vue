<template>
  <div class="space-y-4">
    <ClientOnly>
      <div v-if="isInsecure" class="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-3 dark:border-amber-500/20 dark:bg-amber-500/5">
        <UIcon name="i-lucide-shield-alert" class="h-5 w-5 shrink-0 text-amber-500" />
        <div class="space-y-1">
          <p class="text-xs font-bold text-amber-700 dark:text-amber-400">连接不安全</p>
          <p class="text-xs leading-5 text-amber-700/80 dark:text-amber-300/80">当前连接未启用 HTTPS，建议在生产环境开启 HTTPS。</p>
        </div>
      </div>
    </ClientOnly>

    <SettingsSection title="AI 连接" description="填写密钥、接口地址与默认模型。">
      <template #actions>
        <UButton label="接口说明" variant="link" color="primary" size="xs" class="p-0 font-bold" @click="emit('open-guide')" />
      </template>

      <div class="space-y-4">
        <UFormField label="接口密钥">
          <UInput :model-value="config.apiKey" type="password" placeholder="sk-..." icon="i-lucide-key" class="w-full" @update:model-value="patch('apiKey', $event)" @blur="emit('fetch-models')" />
        </UFormField>

        <UFormField label="Provider 类型">
          <USelect :model-value="config.providerType" :items="providerTypeItems" class="w-full" @update:model-value="patch('providerType', $event)" />
          <p class="mt-1 text-xs leading-5 text-gray-500 dark:text-gray-400">OpenAI 兼容覆盖 Ollama/LM Studio/vLLM；Anthropic 和 Gemini 使用官方原生协议。</p>
        </UFormField>

        <UFormField label="接口基础地址">
          <UInput :model-value="config.apiBaseUrl" placeholder="https://api.openai.com/v1" icon="i-lucide-globe" class="w-full" @update:model-value="patch('apiBaseUrl', $event)" @blur="emit('fetch-models')" />
        </UFormField>

        <UFormField label="默认模型">
          <div class="space-y-2">
            <div class="flex gap-2">
              <USelect v-if="modelItems.length && !useManualModelInput" :model-value="config.defaultModel" :items="modelItems" class="min-w-0 flex-1" @update:model-value="patch('defaultModel', $event)" />
              <UInput v-else :model-value="config.defaultModel" placeholder="例如 gpt-4o-mini" class="flex-1" @update:model-value="patch('defaultModel', $event)" />
              <UButton icon="i-lucide-refresh-cw" color="neutral" variant="ghost" size="sm" :loading="fetchingModels" title="获取模型列表" aria-label="获取模型列表" @click="emit('fetch-models')" />
            </div>
            <div class="flex items-center justify-between gap-3 rounded-xl border border-gray-100 bg-gray-50/70 p-3 dark:border-gray-800 dark:bg-gray-900/40">
              <div class="space-y-0.5">
                <p class="text-xs font-medium text-gray-700 dark:text-gray-300">手动填写模型名称</p>
                <p class="text-xs text-gray-500 dark:text-gray-400">开启后可直接输入模型标识，不依赖模型列表。</p>
              </div>
              <USwitch :model-value="useManualModelInput" @update:model-value="emit('update:useManualModelInput', $event)" />
            </div>
            <div v-if="fetchingModels" class="flex items-center gap-2 text-xs text-gray-500"><UIcon name="i-lucide-loader-2" class="h-3 w-3 animate-spin" />获取中...</div>
            <div v-else-if="modelError" class="text-xs text-amber-600 dark:text-amber-400">{{ modelError }}</div>
            <div v-else-if="modelItems.length" class="text-xs text-green-600 dark:text-green-400">已加载 {{ modelItems.length }} 个可用模型</div>
          </div>
        </UFormField>
      </div>
    </SettingsSection>

    <div class="rounded-2xl border border-primary-100 bg-primary-50/60 p-4 dark:border-primary-900/40 dark:bg-primary-500/5">
      <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div class="space-y-1">
          <p class="text-sm font-semibold text-primary-800 dark:text-primary-200">使用 NAS 本地模型</p>
          <p class="text-xs leading-5 text-primary-900 dark:text-primary-200">Ollama、LM Studio、llama.cpp、vLLM 都可以通过 OpenAI 兼容地址接入，适合隐私优先和零 API 费用场景。</p>
        </div>
        <UButton label="查看本地模型接入" size="xs" color="primary" variant="soft" @click="emit('open-guide')" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
interface Props {
  config: Record<string, any>
  providerTypeItems: Array<{ label: string, value: string }>
  modelItems: Array<{ label: string, value: string }>
  useManualModelInput: boolean
  fetchingModels: boolean
  modelError: string
  isInsecure: boolean
}

defineProps<Props>()

const emit = defineEmits<{
  'update:config': [patch: Record<string, any>]
  'update:useManualModelInput': [value: boolean]
  'fetch-models': []
  'open-guide': []
}>()

function patch(field: string, value: any) {
  emit('update:config', { [field]: value })
}
</script>
