<template>
  <div class="space-y-4">
    <SettingsSection title="智能增强" description="简繁双输出、字幕质检、翻译记忆、预算与媒体元数据。">
      <div class="grid gap-3 md:grid-cols-2">
        <div class="app-field-row">
          <div class="space-y-0.5">
            <p class="text-sm font-medium text-gray-700 dark:text-gray-300">简繁双输出</p>
            <p class="text-xs leading-5 text-gray-500 dark:text-gray-400">简体任务额外生成繁体，繁体任务额外生成简体。</p>
          </div>
          <USwitch :model-value="config.chineseVariantOutputEnabled" aria-label="启用简繁双输出" @update:model-value="patch('chineseVariantOutputEnabled', $event)" />
        </div>
        <div class="app-field-row">
          <div class="space-y-0.5">
            <p class="text-sm font-medium text-gray-700 dark:text-gray-300">字幕技术质检</p>
            <p class="text-xs leading-5 text-gray-500 dark:text-gray-400">检查行长、CPS、时长、重叠和 SDH 残留。</p>
          </div>
          <USwitch :model-value="config.subtitleQualityEnabled" aria-label="启用字幕技术质检" @update:model-value="patch('subtitleQualityEnabled', $event)" />
        </div>
      </div>

      <div v-if="config.subtitleQualityEnabled" class="surface-muted p-3 space-y-3">
        <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
          <UFormField label="单行字数上限">
            <UInputNumber :model-value="config.subtitleQualityMaxCharsPerLine" :min="8" :max="80" class="w-full" @update:model-value="patch('subtitleQualityMaxCharsPerLine', toNumber($event))" />
          </UFormField>
          <UFormField label="最多行数">
            <UInputNumber :model-value="config.subtitleQualityMaxLines" :min="1" :max="6" class="w-full" @update:model-value="patch('subtitleQualityMaxLines', toNumber($event))" />
          </UFormField>
          <UFormField label="CPS 上限">
            <UInputNumber :model-value="config.subtitleQualityMaxCps" :min="5" :max="60" class="w-full" @update:model-value="patch('subtitleQualityMaxCps', toNumber($event))" />
          </UFormField>
          <UFormField label="最短显示 ms">
            <UInputNumber :model-value="config.subtitleQualityMinDurationMs" :min="100" :max="10000" :step="100" class="w-full" @update:model-value="patch('subtitleQualityMinDurationMs', toNumber($event))" />
          </UFormField>
          <UFormField label="最长显示 ms">
            <UInputNumber :model-value="config.subtitleQualityMaxDurationMs" :min="1000" :max="60000" :step="500" class="w-full" @update:model-value="patch('subtitleQualityMaxDurationMs', toNumber($event))" />
          </UFormField>
          <UFormField label="最小间隔 ms">
            <UInputNumber :model-value="config.subtitleQualityGapMs" :min="0" :max="2000" :step="10" class="w-full" @update:model-value="patch('subtitleQualityGapMs', toNumber($event))" />
          </UFormField>
        </div>
        <div class="app-field-row mt-3">
          <div>
            <p class="text-xs font-medium text-gray-700 dark:text-gray-200">自动换行修正</p>
            <p class="text-xs text-gray-500 dark:text-gray-400">只处理超长行，不改变译文内容。</p>
          </div>
          <USwitch :model-value="config.subtitleQualityAutoFixEnabled" aria-label="启用字幕自动换行修正" @update:model-value="patch('subtitleQualityAutoFixEnabled', $event)" />
        </div>
      </div>
    </SettingsSection>

    <SettingsSection title="翻译记忆" description="复用核对确认过的译法和媒体库已有双语字幕。">
      <template #actions>
        <UBadge color="neutral" variant="subtle">{{ memoryStats.total.toLocaleString() }} 条</UBadge>
      </template>
      <div class="space-y-3">
        <div class="app-field-row">
          <div class="space-y-0.5">
            <p class="text-sm font-medium text-gray-700 dark:text-gray-300">启用翻译记忆</p>
            <p class="text-xs leading-5 text-gray-500 dark:text-gray-400">命中时直接复用已确认译法，不重复调用模型。</p>
          </div>
          <USwitch :model-value="config.translationMemoryEnabled" aria-label="启用翻译记忆" @update:model-value="patch('translationMemoryEnabled', $event)" />
        </div>
        <div class="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
          <UFormField label="媒体库">
            <USelect v-model="memoryRootId" :items="rootItems" class="w-full" />
          </UFormField>
          <UFormField label="学习目标语言">
            <USelect v-model="memoryLanguage" :items="languageOptions" class="w-full" />
          </UFormField>
          <div class="flex items-end gap-2">
            <UButton label="从字幕学习" icon="i-lucide-brain-circuit" color="primary" variant="soft" :loading="mining" @click="mineMemory" />
            <UButton label="清空" icon="i-lucide-trash-2" color="error" variant="ghost" :disabled="!memoryStats.total" @click="clearMemory" />
          </div>
        </div>
        <div v-if="memoryStats.byLanguage.length" class="flex flex-wrap gap-1.5">
          <UBadge v-for="item in memoryStats.byLanguage" :key="item.targetLanguage" color="neutral" variant="subtle">
            {{ item.targetLanguage }} · {{ item.entries }} 条 · 使用 {{ item.uses }} 次
          </UBadge>
        </div>
        <p v-else class="text-xs text-gray-500 dark:text-gray-400">还没有翻译记忆。核对导出后会自动学习人工修改；也可以从已有双语字幕批量学习。</p>

        <div v-if="memoryStats.topTerms?.length" class="surface-muted p-3">
          <p class="text-xs font-medium text-gray-700 dark:text-gray-200">高频术语候选</p>
          <p class="mt-0.5 text-xs text-gray-500 dark:text-gray-400">来自翻译记忆；加入后只影响后续任务。</p>
          <div class="mt-2 grid gap-1.5 sm:grid-cols-2">
            <div v-for="term in memoryStats.topTerms" :key="`${term.sourceText}-${term.translatedText}`" class="flex items-center justify-between gap-2 rounded-lg bg-white/80 px-2 py-1.5 text-xs dark:bg-gray-950/40">
              <span class="min-w-0 truncate text-gray-600 dark:text-gray-300" :title="term.sourceText">{{ term.sourceText }} → {{ term.translatedText }}</span>
              <UButton label="加入" size="xs" color="primary" variant="ghost" @click="addMemoryTerm(term)" />
            </div>
          </div>
        </div>
      </div>
    </SettingsSection>

    <SettingsSection title="成本预算" description="按 token 记录翻译开销，超预算时暂停自动任务。">
      <div class="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <div class="app-field-row">
          <div>
            <p class="text-xs font-medium text-gray-700 dark:text-gray-200">启用月度预算</p>
            <p class="text-xs text-gray-500 dark:text-gray-400">自动任务会遵守上限</p>
          </div>
          <USwitch :model-value="config.costBudgetEnabled" aria-label="启用月度预算" @update:model-value="patch('costBudgetEnabled', $event)" />
        </div>
        <UFormField label="月度上限（USD）">
          <UInputNumber :model-value="config.costBudgetMonthlyUsd" :min="0" :max="1000000" :step="0.1" class="w-full" @update:model-value="patch('costBudgetMonthlyUsd', toNumber($event))" />
        </UFormField>
        <UFormField label="输入价格 / 1M tokens">
          <UInputNumber :model-value="config.costPricePromptPer1M" :min="0" :max="1000000" :step="0.01" class="w-full" @update:model-value="patch('costPricePromptPer1M', toNumber($event))" />
        </UFormField>
        <UFormField label="输出价格 / 1M tokens">
          <UInputNumber :model-value="config.costPriceCompletionPer1M" :min="0" :max="1000000" :step="0.01" class="w-full" @update:model-value="patch('costPriceCompletionPer1M', toNumber($event))" />
        </UFormField>
      </div>
      <div class="surface-muted mt-3 p-3">
        <div class="flex flex-wrap items-center justify-between gap-2 text-xs text-gray-600 dark:text-gray-300">
          <span>本月已用 <strong class="text-gray-900 dark:text-white">${{ cost.spentUsd.toFixed(4) }}</strong> · {{ cost.totalTokens.toLocaleString() }} tokens</span>
          <UButton label="刷新" size="xs" color="neutral" variant="ghost" icon="i-lucide-refresh-cw" @click="loadCost" />
        </div>
        <div class="mt-2 h-2 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-800">
          <div class="h-full rounded-full transition-all duration-500" :class="budgetBarClass" :style="{ width: `${budgetPercent}%` }" />
        </div>
      </div>
    </SettingsSection>

    <SettingsSection title="媒体元数据" description="可选接入 TMDB，用剧名、集名和简介增强翻译上下文。">
      <div class="space-y-3">
        <div class="app-field-row">
          <div class="space-y-0.5">
            <p class="text-sm font-medium text-gray-700 dark:text-gray-300">启用 TMDB 元数据</p>
            <p class="text-xs leading-5 text-gray-500 dark:text-gray-400">只发送片名/季集编号，不发送媒体文件。</p>
          </div>
          <USwitch :model-value="config.metadataEnabled" aria-label="启用 TMDB 元数据" @update:model-value="patch('metadataEnabled', $event)" />
        </div>
        <div class="app-field-row">
          <div class="space-y-0.5">
            <p class="text-sm font-medium text-gray-700 dark:text-gray-300">自动搜索并填充</p>
            <p class="text-xs leading-5 text-gray-500 dark:text-gray-400">默认关闭。关闭后不自动匹配，需在文件浏览器手动点击「搜索 TMDB」。</p>
          </div>
          <USwitch :model-value="config.metadataAutoSearchEnabled" :disabled="!config.metadataEnabled" aria-label="自动搜索 TMDB 并填充" @update:model-value="patch('metadataAutoSearchEnabled', $event)" />
        </div>
        <div class="grid gap-3 md:grid-cols-[minmax(0,1fr)_180px_auto]">
          <UFormField label="TMDB API Key">
            <UInput :model-value="config.metadataApiKey" type="password" placeholder="v3 API Key" class="w-full" @update:model-value="patch('metadataApiKey', $event)" />
          </UFormField>
          <UFormField label="元数据语言">
            <USelect :model-value="config.metadataLanguage" :items="metadataLanguageItems" class="w-full" @update:model-value="patch('metadataLanguage', $event)" />
          </UFormField>
          <div class="flex items-end">
            <UButton label="检测" icon="i-lucide-plug" color="neutral" variant="soft" :loading="testingMetadata" @click="testMetadata" />
          </div>
        </div>
        <p class="text-xs leading-5 text-gray-500 dark:text-gray-400">TMDB Key 加密保存；同一影片的结果会缓存 30 天。自动搜索默认关闭，批量自动任务也遵循该开关。</p>
      </div>
    </SettingsSection>
  </div>
</template>

<script setup lang="ts">
import { LANGUAGE_OPTIONS } from '~~/shared/languages'
import type { CostSummary, TranslationMemoryStats } from '~~/types'

interface Props { config: Record<string, any> }
const props = defineProps<Props>()
const emit = defineEmits<{ 'update:config': [patch: Record<string, any>] }>()
const toast = useToast()
const { confirm } = useConfirm()

const languageOptions = LANGUAGE_OPTIONS
const metadataLanguageItems = [
  { label: '简体中文', value: 'zh-CN' },
  { label: '繁体中文', value: 'zh-TW' },
  { label: 'English', value: 'en' },
  { label: '日本語', value: 'ja' },
  { label: '한국어', value: 'ko' }
]
const roots = computed(() => (Array.isArray(props.config.mediaRoots) ? props.config.mediaRoots : [])
  .filter((root: any) => root?.enabled !== false && root?.id)
  .map((root: any) => ({ label: root.name || root.path || String(root.id), value: String(root.id) })))
const rootItems = computed(() => roots.value)
const memoryRootId = ref(String(roots.value[0]?.value || ''))
const memoryLanguage = ref(String(props.config.targetLanguage || 'zh-CN'))
const mining = ref(false)
const testingMetadata = ref(false)
const memoryStats = ref<TranslationMemoryStats>({ total: 0, byLanguage: [] })
const cost = ref<CostSummary>({
  month: '',
  budgetEnabled: false,
  budgetUsd: 0,
  spentUsd: 0,
  remainingUsd: 0,
  promptTokens: 0,
  completionTokens: 0,
  totalTokens: 0,
  taskCount: 0,
  byModel: []
})
const budgetPercent = computed(() => {
  if (!cost.value.budgetEnabled || !cost.value.budgetUsd) return 0
  return Math.min(100, Math.round((cost.value.spentUsd / cost.value.budgetUsd) * 100))
})
const budgetBarClass = computed(() => budgetPercent.value >= 90 ? 'bg-red-500' : budgetPercent.value >= 70 ? 'bg-amber-500' : 'bg-emerald-500')

watch(roots, (items) => {
  if (!memoryRootId.value && items[0]) memoryRootId.value = String(items[0].value)
}, { immediate: true })

function patch(field: string, value: any) {
  emit('update:config', { [field]: value })
}
function toNumber(value: any) {
  const parsed = parseFloat(value)
  return Number.isNaN(parsed) ? value : parsed
}
async function loadCost() {
  try { cost.value = await $fetch<CostSummary>('/api/cost/summary') } catch { /* optional */ }
}
async function loadMemory() {
  try { memoryStats.value = await $fetch<TranslationMemoryStats>('/api/translation-memory/stats') } catch { /* optional */ }
}
async function mineMemory() {
  if (!memoryRootId.value) {
    toast.add({ title: '请先添加媒体库', color: 'warning' })
    return
  }
  mining.value = true
  try {
    const result = await $fetch<any>('/api/translation-memory/mine', {
      method: 'POST',
      body: { rootId: memoryRootId.value, targetLanguage: memoryLanguage.value || props.config.targetLanguage }
    })
    toast.add({
      title: result.learned > 0 ? `已学习 ${result.learned} 条译法` : '没有发现可学习的双语字幕',
      description: result.message,
      color: result.learned > 0 ? 'success' : 'neutral'
    })
    await loadMemory()
  } catch (error: any) {
    toast.add({ title: '学习失败', description: error?.data?.message || error?.message, color: 'error' })
  } finally {
    mining.value = false
  }
}
async function clearMemory() {
  const ok = await confirm({
    title: '清空翻译记忆？',
    description: `将删除 ${memoryLanguage.value || '当前语言'} 的记忆条目，不影响已有字幕和任务。`,
    confirmLabel: '清空记忆',
    cancelLabel: '取消',
    color: 'error'
  })
  if (!ok) return
  try {
    const result = await $fetch<{ removed: number }>('/api/translation-memory/clear', {
      method: 'POST',
      body: { targetLanguage: memoryLanguage.value || undefined }
    })
    toast.add({ title: `已清空 ${result.removed} 条翻译记忆`, color: 'success' })
    await loadMemory()
  } catch (error: any) {
    toast.add({ title: '清空失败', description: error?.data?.message || error?.message, color: 'error' })
  }
}

function addMemoryTerm(term: { sourceText: string, translatedText: string }) {
  const glossary = { ...(props.config.glossary || {}), [term.sourceText]: term.translatedText }
  patch('glossary', glossary)
  toast.add({ title: '已加入术语表', description: `${term.sourceText} → ${term.translatedText}；保存设置后生效`, color: 'success' })
}

async function testMetadata() {
  testingMetadata.value = true
  try {
    const apiKey = String(props.config.metadataApiKey || '')
    await $fetch('/api/metadata/test', {
      method: 'POST',
      body: { apiKey: apiKey.includes('*') ? undefined : apiKey, language: props.config.metadataLanguage || 'zh-CN' }
    })
    toast.add({ title: 'TMDB 连接正常', color: 'success' })
  } catch (error: any) {
    toast.add({ title: 'TMDB 检测失败', description: error?.data?.message || error?.message, color: 'error' })
  } finally {
    testingMetadata.value = false
  }
}

onMounted(() => {
  void loadCost()
  void loadMemory()
})
</script>
