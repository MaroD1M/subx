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

    <div class="rounded-2xl border border-gray-200/80 p-3 dark:border-gray-800">
      <div class="flex items-start justify-between gap-3">
        <button type="button" class="flex min-w-0 flex-1 items-start gap-2 text-left" :aria-expanded="fallbackExpanded" @click="fallbackExpanded = !fallbackExpanded">
          <UIcon :name="fallbackExpanded ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'" class="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
          <div class="min-w-0 space-y-1">
            <p class="text-sm font-semibold text-gray-700 dark:text-gray-300">失败回退</p>
            <p class="text-xs leading-5 text-gray-500 dark:text-gray-400">主供应商重试后仍缺译或失败时，用备用供应商补译。建议填写本地 Ollama 或低价模型，避免主服务不可用时整块回退原文。</p>
          </div>
        </button>
        <div class="flex shrink-0 items-center gap-2 pt-0.5">
          <span class="text-xs text-gray-600 dark:text-gray-400">启用备用供应商</span>
          <USwitch :model-value="config.fallbackProviderEnabled" aria-label="启用备用供应商" @update:model-value="patch('fallbackProviderEnabled', $event)" />
        </div>
      </div>

      <div v-if="fallbackExpanded" class="mt-3 border-t border-gray-100 pt-3 dark:border-gray-800">
        <div v-if="config.fallbackProviderEnabled" class="space-y-4">
          <UFormField label="Provider 类型">
            <USelect :model-value="config.fallbackProviderType" :items="providerTypeItems" class="w-full" @update:model-value="patch('fallbackProviderType', $event)" />
          </UFormField>

          <UFormField label="接口基础地址">
            <UInput :model-value="config.fallbackApiBaseUrl" placeholder="http://127.0.0.1:11434/v1" icon="i-lucide-globe" class="w-full" @update:model-value="patch('fallbackApiBaseUrl', $event)" />
          </UFormField>

          <UFormField label="API Key">
            <UInput :model-value="config.fallbackApiKey" type="password" placeholder="sk-..." icon="i-lucide-key" class="w-full" @update:model-value="patch('fallbackApiKey', $event)" />
          </UFormField>

          <UFormField label="备用模型" required>
            <UInput :model-value="config.fallbackModel" placeholder="例如 qwen2.5:7b" class="w-full" @update:model-value="patch('fallbackModel', $event)" />
          </UFormField>

          <p class="text-xs leading-5 text-gray-500 dark:text-gray-400">API Key 会加密保存，且备用供应商只在主供应商失败后使用。</p>
        </div>
        <p v-else class="text-xs leading-5 text-gray-500 dark:text-gray-400">开启后可填写备用供应商配置。</p>
      </div>
    </div>

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
import { ref } from 'vue'

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

const fallbackExpanded = ref(true)

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
