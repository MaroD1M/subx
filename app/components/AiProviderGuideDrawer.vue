<template>
  <UModal
    v-model:open="openState"
    title="AI 接入指引"
    description="选择服务商后查看填写方式，并可一键应用示例配置。"
    :ui="{
      width: '!max-w-none w-screen h-screen sm:h-auto sm:w-auto',
      content: 'sm:ml-auto sm:mr-0 sm:h-screen sm:max-h-screen sm:w-[min(92vw,1080px)] sm:rounded-none sm:rounded-l-3xl'
    }"
  >
    <template #content>
      <div class="flex h-screen max-h-screen min-h-screen flex-col overflow-hidden md:flex-row sm:h-[100dvh] sm:min-h-[100dvh]">
        <aside class="w-full border-b border-gray-100 bg-gray-50/80 p-4 dark:border-gray-800 dark:bg-gray-950/40 md:w-56 md:border-b-0 md:border-r md:p-4">
          <p class="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">服务商</p>
          <div class="space-y-2">
            <button
              v-for="provider in AI_PROVIDER_GUIDES"
              :key="provider.id"
              type="button"
              class="w-full rounded-xl border p-3 text-left transition"
              :class="provider.id === activeProviderId
                ? 'border-primary-200 bg-primary-50 text-primary-700 shadow-sm dark:border-primary-500/40 dark:bg-primary-500/10 dark:text-primary-300'
                : 'border-gray-100 bg-white text-gray-700 hover:border-gray-200 hover:bg-gray-50 dark:border-gray-800 dark:bg-gray-900/60 dark:text-gray-200 dark:hover:border-gray-700 dark:hover:bg-gray-900'"
              @click="activeProviderId = provider.id"
            >
              <div class="flex items-center justify-between gap-2">
                <span class="text-sm font-medium">{{ provider.name }}</span>
                <span
                  v-if="provider.badge"
                  class="rounded-full bg-primary-100 px-2 py-0.5 text-[10px] font-semibold text-primary-700 dark:bg-primary-500/15 dark:text-primary-300"
                >
                  {{ provider.badge }}
                </span>
              </div>
              <p class="mt-1 text-[11px] leading-5 text-gray-500 dark:text-gray-400">{{ provider.description }}</p>
            </button>
          </div>
        </aside>

        <section class="flex-1 overflow-y-auto p-5 sm:p-6 md:p-7">
          <div v-if="activeProvider" class="space-y-6">
            <div class="flex flex-col gap-4 border-b border-gray-100 pb-4 dark:border-gray-800 lg:flex-row lg:items-start lg:justify-between">
              <div class="min-w-0 flex-1">
                <div class="flex flex-wrap items-center gap-2">
                  <h3 class="text-xl font-semibold text-gray-900 dark:text-gray-100">{{ activeProvider.name }}</h3>
                  <span :class="compatibilityClass(activeProvider.compatibility)" class="rounded-full px-2.5 py-1 text-[11px] font-medium">
                    {{ compatibilityLabel(activeProvider.compatibility) }}
                  </span>
                </div>
                <p class="mt-2 text-sm leading-6 text-gray-500 dark:text-gray-400">{{ activeProvider.description }}</p>
                <a
                  v-if="activeProvider.officialUrl"
                  :href="activeProvider.officialUrl"
                  target="_blank"
                  rel="noreferrer"
                  class="mt-3 inline-flex items-center gap-1 text-sm font-medium text-primary-600 hover:text-primary-500 dark:text-primary-400 dark:hover:text-primary-300"
                >
                  {{ activeProvider.officialLabel || '前往官网 / 控制台' }}
                  <UIcon name="i-lucide-arrow-up-right" class="h-3.5 w-3.5" />
                </a>
              </div>
              <div class="flex shrink-0 items-center gap-3">
                <UButton label="应用示例" color="primary" @click="applyProvider(activeProvider)" />
              </div>
            </div>

            <div class="grid gap-3">
              <div class="rounded-2xl border border-gray-100 bg-gray-50/80 p-4 dark:border-gray-800 dark:bg-gray-900/40">
                <p class="text-xs font-medium text-gray-500 dark:text-gray-400">推荐基础 URL</p>
                <p class="mt-2 text-sm font-medium leading-6 text-gray-900 break-words dark:text-gray-100">{{ activeProvider.apiBaseUrl || '请以服务商文档提供的兼容地址为准' }}</p>
              </div>
              <div class="rounded-2xl border border-gray-100 bg-gray-50/80 p-4 dark:border-gray-800 dark:bg-gray-900/40">
                <p class="text-xs font-medium text-gray-500 dark:text-gray-400">模型填写建议</p>
                <p class="mt-2 text-sm font-medium leading-6 text-gray-900 dark:text-gray-100">{{ activeProvider.defaultModel || '请填写服务商提供的模型 ID' }}</p>
                <p class="mt-1 text-xs leading-5 text-gray-500 dark:text-gray-400">{{ activeProvider.recommendManualModel ? '推荐开启手动填写模型名称。' : '可优先尝试自动获取模型列表。' }}</p>
              </div>
            </div>

            <div class="rounded-2xl border border-gray-100 bg-white/80 p-5 dark:border-gray-800 dark:bg-gray-950/30">
              <p class="text-sm font-semibold text-gray-900 dark:text-gray-100">接入步骤</p>
              <ul class="mt-4 space-y-3 text-sm leading-6 text-gray-600 dark:text-gray-400">
                <li v-for="(step, index) in activeProvider.steps" :key="step" class="flex gap-3">
                  <span class="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary-100 text-[11px] font-semibold text-primary-700 dark:bg-primary-500/15 dark:text-primary-300">{{ index + 1 }}</span>
                  <span>{{ step }}</span>
                </li>
              </ul>
            </div>

            <div class="rounded-2xl border border-gray-100 bg-white/80 p-5 dark:border-gray-800 dark:bg-gray-950/30">
              <p class="text-sm font-semibold text-gray-900 dark:text-gray-100">补充说明</p>
              <ul class="mt-4 space-y-3 text-sm leading-6 text-gray-600 dark:text-gray-400">
                <li class="flex gap-2">
                  <UIcon name="i-lucide-link" class="mt-1 h-4 w-4 shrink-0 text-gray-400" />
                  <span>{{ activeProvider.supportsModelList ? '通常支持自动获取模型列表。' : '如果无法获取模型列表，可直接手动填写模型名称。' }}</span>
                </li>
                <li v-for="note in activeProvider.notes" :key="note" class="flex gap-2">
                  <UIcon name="i-lucide-info" class="mt-1 h-4 w-4 shrink-0 text-gray-400" />
                  <span>{{ note }}</span>
                </li>
              </ul>
            </div>

            <div class="sticky bottom-0 flex items-center justify-end gap-3 border-t border-gray-100 bg-white/95 pt-4 pb-1 dark:border-gray-800 dark:bg-gray-950/95">
              <UButton label="关闭" color="neutral" variant="ghost" @click="openState = false" />
              <UButton label="应用示例" color="primary" @click="applyProvider(activeProvider)" />
            </div>
          </div>
        </section>
      </div>
    </template>
  </UModal>
</template>

<script setup lang="ts">
import { AI_PROVIDER_GUIDES, type AiProviderCompatibility, type AiProviderGuide } from '../constants/aiProviders'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{
  'update:open': [value: boolean]
  apply: [payload: { apiBaseUrl?: string, defaultModel?: string, useManualModelInput?: boolean }]
}>()

const openState = computed({
  get: () => props.open,
  set: (value: boolean) => emit('update:open', value)
})

const activeProviderId = ref(AI_PROVIDER_GUIDES[0]?.id || '')

const activeProvider = computed(() => AI_PROVIDER_GUIDES.find(provider => provider.id === activeProviderId.value) || AI_PROVIDER_GUIDES[0])

function compatibilityLabel(type: AiProviderCompatibility) {
  switch (type) {
    case 'official': return '官方支持'
    case 'openai-compatible': return '兼容 OpenAI'
    case 'partial': return '需兼容入口'
  }
}

function compatibilityClass(type: AiProviderCompatibility) {
  switch (type) {
    case 'official':
      return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300'
    case 'openai-compatible':
      return 'bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300'
    case 'partial':
      return 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300'
  }
}

function applyProvider(provider: AiProviderGuide) {
  emit('apply', {
    apiBaseUrl: provider.apiBaseUrl,
    defaultModel: provider.defaultModel,
    useManualModelInput: provider.recommendManualModel
  })
  openState.value = false
}
</script>
