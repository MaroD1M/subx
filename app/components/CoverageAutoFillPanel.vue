<template>
  <section class="surface-card overflow-hidden">
    <button type="button" class="flex w-full items-center justify-between gap-3 px-3 py-3 text-left sm:px-4" @click="expanded = !expanded">
      <div class="flex min-w-0 items-center gap-3">
        <span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary-700 dark:bg-primary-950/30 dark:text-primary-300">
          <UIcon name="i-lucide-calendar-check-2" class="h-4 w-4" />
        </span>
        <div class="min-w-0">
          <p class="flex flex-wrap items-center gap-2 text-sm font-semibold text-gray-900 dark:text-white">
            自动补齐缺失字幕
            <UBadge :color="policy.enabled ? 'success' : 'neutral'" variant="subtle" size="sm">{{ policy.enabled ? '已开启' : '未开启' }}</UBadge>
          </p>
          <p class="mt-0.5 text-[11px] leading-5 text-gray-500 dark:text-gray-400">
            {{ policy.lastRunSummary || '定时扫描缺失文件，按并发和预算自动创建任务。' }}
          </p>
        </div>
      </div>
      <UIcon :name="expanded ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'" class="h-4 w-4 shrink-0 text-gray-500 dark:text-gray-400" />
    </button>

    <div v-if="expanded" class="space-y-4 border-t border-gray-100 px-3 py-4 dark:border-gray-800 sm:px-4">
      <div class="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <div class="flex items-center justify-between gap-3 rounded-xl border border-gray-100 bg-gray-50/70 px-3 py-2.5 dark:border-gray-800 dark:bg-gray-900/40">
          <div>
            <p class="text-xs font-medium text-gray-700 dark:text-gray-200">启用自动补齐</p>
            <p class="text-[10px] text-gray-500 dark:text-gray-400">只处理状态为缺失的视频</p>
          </div>
          <USwitch v-model="policy.enabled" aria-label="启用自动补齐" />
        </div>
        <UFormField label="目标语言">
          <USelect v-model="policy.targetLanguage" :items="languageOptions" class="w-full" />
        </UFormField>
        <UFormField label="调度方式">
          <USelect v-model="policy.scheduleType" :items="scheduleItems" class="w-full" />
        </UFormField>
        <UFormField :label="policy.scheduleType === 'daily' ? '每天执行时间' : '执行间隔（小时）'">
          <UInput v-if="policy.scheduleType === 'daily'" v-model="policy.dailyTime" type="time" class="w-full" />
          <UInputNumber v-else v-model="policy.intervalHours" :min="1" :max="168" class="w-full" />
        </UFormField>
        <UFormField label="运行时段开始">
          <UInput v-model="policy.runWindowStart" type="time" class="w-full" />
        </UFormField>
        <UFormField label="运行时段结束">
          <UInput v-model="policy.runWindowEnd" type="time" class="w-full" />
        </UFormField>
        <UFormField label="每次最多任务数">
          <UInputNumber v-model="policy.maxTasksPerRun" :min="1" :max="100" class="w-full" />
        </UFormField>
        <UFormField label="跳过最近 N 天文件">
          <UInputNumber v-model="policy.skipRecentDays" :min="0" :max="365" class="w-full" />
        </UFormField>
      </div>

      <div class="grid gap-2 sm:grid-cols-2">
        <div class="flex items-center justify-between gap-3 rounded-xl border border-gray-100 bg-gray-50/70 px-3 py-2.5 dark:border-gray-800 dark:bg-gray-900/40">
          <div>
            <p class="text-xs font-medium text-gray-700 dark:text-gray-200">包含内嵌字幕</p>
            <p class="text-[10px] text-gray-500 dark:text-gray-400">有内嵌目标语言轨时视为已覆盖</p>
          </div>
          <USwitch v-model="policy.includeEmbedded" aria-label="包含内嵌字幕" />
        </div>
        <div class="rounded-xl border border-gray-100 bg-gray-50/70 px-3 py-2.5 text-[11px] leading-5 text-gray-500 dark:border-gray-800 dark:bg-gray-900/40 dark:text-gray-400">
          <p>下次计划：<span class="font-medium text-gray-700 dark:text-gray-200">{{ policy.nextRunAt ? formatDate(policy.nextRunAt) : '未启用' }}</span></p>
          <p v-if="policy.lastRunAt">上次执行：{{ formatDate(policy.lastRunAt) }} · {{ runStatusLabel(policy.lastRunStatus) }}</p>
        </div>
      </div>

      <div class="flex flex-wrap items-center justify-end gap-2">
        <UButton label="保存策略" icon="i-lucide-save" size="sm" color="primary" variant="soft" :loading="saving" @click="save" />
        <UButton label="预览可补齐" icon="i-lucide-scan-search" size="sm" color="neutral" variant="soft" :loading="previewing" @click="preview" />
        <UButton label="立即补齐" icon="i-lucide-wand-sparkles" size="sm" color="primary" :loading="running" @click="runNow" />
      </div>

      <div v-if="previewResult" class="rounded-xl border border-primary-100 bg-primary-50/60 p-3 text-xs dark:border-primary-900/40 dark:bg-primary-950/20">
        <p class="font-semibold text-primary-800 dark:text-primary-200">{{ previewResult.summary || `发现 ${previewResult.candidates} 个可补齐文件` }}</p>
        <div v-if="previewResult.preview?.length" class="mt-2 space-y-1">
          <p v-for="item in previewResult.preview.slice(0, 8)" :key="item.path" class="truncate text-primary-700/80 dark:text-primary-300/80">
            {{ item.seriesTitle }} · {{ item.name }}
          </p>
          <p v-if="previewResult.preview.length > 8" class="text-primary-600/70 dark:text-primary-400/70">还有 {{ previewResult.preview.length - 8 }} 个文件...</p>
        </div>
        <p v-if="previewResult.estimatedCostUsd > 0" class="mt-1 text-primary-700/80 dark:text-primary-300/80">按历史均值预计费用：${{ previewResult.estimatedCostUsd.toFixed(4) }}</p>
        <p v-if="previewResult.budgetBlocked" class="mt-2 text-amber-700 dark:text-amber-300">本月预算已用完，补齐已暂停。</p>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { LANGUAGE_OPTIONS } from '~~/shared/languages'
import { formatDateTime } from '~~/shared/time'

const props = defineProps<{
  roots: Array<{ id: string, name?: string, path?: string }>
  targetLanguage: string
}>()
const emit = defineEmits<{ completed: [] }>()
const rootId = defineModel<string>('rootId', { required: true })
const expanded = ref(false)
const saving = ref(false)
const previewing = ref(false)
const running = ref(false)
const previewResult = ref<any>(null)
const toast = useToast()
const { confirm } = useConfirm()
const timeZone = useTimeZone()
const languageOptions = LANGUAGE_OPTIONS
const scheduleItems = [
  { label: '每天固定时间', value: 'daily' },
  { label: '按间隔执行', value: 'interval' }
]
const policy = reactive<any>({
  enabled: false,
  targetLanguage: props.targetLanguage || 'zh-CN',
  scheduleType: 'daily',
  intervalHours: 24,
  dailyTime: '03:00',
  runWindowStart: '',
  runWindowEnd: '',
  maxTasksPerRun: 10,
  skipRecentDays: 1,
  includeEmbedded: true,
  lastRunAt: '',
  lastRunStatus: 'idle',
  lastRunSummary: '',
  nextRunAt: ''
})
let loadedRoot = ''

const runStatusLabels: Record<string, string> = {
  idle: '待运行',
  running: '执行中',
  done: '完成',
  skipped: '已跳过',
  error: '失败'
}

function runStatusLabel(value: unknown) {
  return runStatusLabels[String(value || 'idle')] || String(value || '待运行')
}

function formatDate(value: unknown) {
  return formatDateTime(value, timeZone)
}

async function loadPolicy() {
  if (!rootId.value || loadedRoot === rootId.value) return
  loadedRoot = rootId.value
  try {
    const result = await $fetch<any>('/api/library/coverage-policy', { query: { rootId: rootId.value } })
    Object.assign(policy, result)
    if (!result?.targetLanguage) policy.targetLanguage = props.targetLanguage || 'zh-CN'
  } catch (error: any) {
    toast.add({ title: '读取自动补齐策略失败', description: error?.data?.message || error?.message, color: 'error' })
  }
}

async function persistPolicy(silent = false) {
  if (!rootId.value) return false
  saving.value = true
  try {
    const result = await $fetch<any>('/api/library/coverage-policy', {
      method: 'PUT',
      body: { ...policy, rootId: rootId.value }
    })
    Object.assign(policy, result)
    if (!silent) toast.add({ title: '自动补齐策略已保存', color: 'success' })
    return true
  } catch (error: any) {
    toast.add({ title: '保存失败', description: error?.data?.message || error?.message, color: 'error' })
    return false
  } finally {
    saving.value = false
  }
}

async function save() {
  await persistPolicy(false)
}

async function preview() {
  if (!rootId.value) return
  if (!await persistPolicy(true)) return
  previewing.value = true
  previewResult.value = null
  try {
    previewResult.value = await $fetch('/api/library/coverage-auto-fill', {
      method: 'POST',
      body: { rootId: rootId.value, dryRun: true, force: true }
    })
  } catch (error: any) {
    toast.add({ title: '预览失败', description: error?.data?.message || error?.message, color: 'error' })
  } finally {
    previewing.value = false
  }
}

async function runNow() {
  if (!rootId.value) return
  if (!await persistPolicy(true)) return
  const ok = await confirm({
    title: '立即补齐缺失字幕？',
    description: '会按当前策略和预算创建翻译任务；低功耗 NAS 建议先预览数量。',
    confirmLabel: '开始补齐',
    cancelLabel: '取消',
    color: 'warning'
  })
  if (!ok) return
  running.value = true
  try {
    const result = await $fetch<any>('/api/library/coverage-auto-fill', {
      method: 'POST',
      body: { rootId: rootId.value, force: true }
    })
    previewResult.value = result
    toast.add({
      title: result.created > 0 ? `已创建 ${result.created} 个任务` : '没有创建新任务',
      description: result.summary,
      color: result.created > 0 ? 'success' : 'neutral'
    })
    emit('completed')
    await loadPolicy()
  } catch (error: any) {
    toast.add({ title: '自动补齐失败', description: error?.data?.message || error?.message, color: 'error' })
  } finally {
    running.value = false
  }
}

watch(rootId, () => {
  loadedRoot = ''
  previewResult.value = null
  void loadPolicy()
})
watch(() => props.targetLanguage, (value) => {
  if (!loadedRoot) policy.targetLanguage = value || 'zh-CN'
})
onMounted(loadPolicy)
</script>
