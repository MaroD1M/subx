<template>
  <div class="space-y-3">
    <div class="flex flex-wrap items-end gap-2">
      <UFormField label="样式预设" class="min-w-0 flex-1">
        <USelect v-model="presetId" :items="presetOptions" class="w-full" />
      </UFormField>
      <UButton label="恢复预设" icon="i-lucide-rotate-ccw" size="sm" color="neutral" variant="soft" @click="resetPreset" />
    </div>
    <p v-if="currentPreset" class="text-xs leading-5 text-gray-500 dark:text-gray-400">{{ currentPreset.description }}</p>

    <div v-if="subtitleFormat === 'srt'" class="rounded-xl border border-amber-200 bg-amber-50/70 px-3 py-2 text-xs leading-5 text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-200">
      SRT 不保存字体、颜色和描边。切换到 ASS 或 SRT + ASS 后，下列样式才会生效。
    </div>
    <div v-else-if="draft.presetId === 'inherit'" class="rounded-xl border border-sky-200 bg-sky-50/70 px-3 py-2 text-xs leading-5 text-sky-800 dark:border-sky-900/40 dark:bg-sky-950/20 dark:text-sky-200">
      已选择“沿用原样式”：会保留源 ASS 的字体、颜色和定位，下方自定义字段不会覆盖源样式。
    </div>

    <div class="grid gap-3" :class="showBoth ? 'xl:grid-cols-2' : 'grid-cols-1'">
      <div v-if="showOriginal" class="space-y-3 rounded-2xl border border-gray-200/80 bg-gray-50/60 p-3 dark:border-gray-800 dark:bg-gray-900/30" :class="{ 'opacity-70': typographyDisabled }">
        <div class="flex items-center justify-between gap-2">
          <div>
            <p class="text-sm font-medium text-gray-700 dark:text-gray-200">原文样式</p>
            <p class="text-[11px] text-gray-500 dark:text-gray-400">仅双语或仅原文模式使用</p>
          </div>
          <UBadge color="neutral" variant="subtle" size="sm">{{ displayMode }}</UBadge>
        </div>
        <div class="grid grid-cols-2 gap-2">
          <UFormField label="字体" class="col-span-2">
            <USelectMenu
              v-model="draft.original.fontFamily"
              :items="fontOptions"
              value-key="value"
              label-key="value"
              :filter-fields="['value', 'description']"
              :search-input="{ placeholder: '搜索或输入字体名' }"
              create-item
              virtualize
              icon="i-lucide-type"
              :loading="serverFontsLoading"
              :disabled="typographyDisabled"
              class="w-full"
              @create="(font: string) => setFontFamily('original', font)"
            />
            <p v-if="fontWarning(draft.original.fontFamily)" class="mt-1 text-[11px] leading-4 text-amber-600 dark:text-amber-400">{{ fontWarning(draft.original.fontFamily) }}</p>
          </UFormField>
          <UFormField label="字号">
            <UInputNumber v-model="draft.original.fontSize" :min="12" :max="120" :step="1" :disabled="typographyDisabled" />
          </UFormField>
          <UFormField label="垂直边距">
            <UInputNumber v-model="draft.original.marginV" :min="0" :max="300" :step="1" :disabled="typographyDisabled" />
          </UFormField>
          <UFormField label="文字颜色">
            <ColorField v-model="draft.original.primaryColor" label="原文文字颜色" :disabled="typographyDisabled" />
          </UFormField>
          <UFormField label="描边颜色">
            <ColorField v-model="draft.original.outlineColor" label="原文描边颜色" :disabled="typographyDisabled" />
          </UFormField>
          <UFormField label="描边宽度">
            <UInputNumber v-model="draft.original.outlineWidth" :min="0" :max="10" :step="0.1" :disabled="typographyDisabled" />
          </UFormField>
          <UFormField label="阴影">
            <UInputNumber v-model="draft.original.shadow" :min="0" :max="10" :step="0.1" :disabled="typographyDisabled" />
          </UFormField>
          <UFormField label="对齐">
            <USelect v-model="draft.original.alignment" :items="alignmentItems" :disabled="typographyDisabled" />
          </UFormField>
          <div class="flex items-end gap-2">
            <USwitch v-model="draft.original.bold" :disabled="typographyDisabled" aria-label="原文加粗" />
            <span class="pb-2 text-xs text-gray-500 dark:text-gray-400">加粗</span>
          </div>
          <div class="flex items-end gap-2">
            <USwitch v-model="draft.original.italic" :disabled="typographyDisabled" aria-label="原文斜体" />
            <span class="pb-2 text-xs text-gray-500 dark:text-gray-400">斜体</span>
          </div>
        </div>
      </div>

      <div v-if="showTranslated" class="space-y-3 rounded-2xl border border-primary-100 bg-primary-50/40 p-3 dark:border-primary-900/30 dark:bg-primary-950/10" :class="{ 'opacity-70': typographyDisabled }">
        <div class="flex items-center justify-between gap-2">
          <div>
            <p class="text-sm font-medium text-gray-700 dark:text-gray-200">译文样式</p>
            <p class="text-[11px] text-gray-500 dark:text-gray-400">仅译文或双语模式使用</p>
          </div>
          <UBadge color="primary" variant="subtle" size="sm">{{ displayMode }}</UBadge>
        </div>
        <div class="grid grid-cols-2 gap-2">
          <UFormField label="字体" class="col-span-2">
            <USelectMenu
              v-model="draft.translated.fontFamily"
              :items="fontOptions"
              value-key="value"
              label-key="value"
              :filter-fields="['value', 'description']"
              :search-input="{ placeholder: '搜索或输入字体名' }"
              create-item
              virtualize
              icon="i-lucide-type"
              :loading="serverFontsLoading"
              :disabled="typographyDisabled"
              class="w-full"
              @create="(font: string) => setFontFamily('translated', font)"
            />
            <p v-if="fontWarning(draft.translated.fontFamily)" class="mt-1 text-[11px] leading-4 text-amber-600 dark:text-amber-400">{{ fontWarning(draft.translated.fontFamily) }}</p>
          </UFormField>
          <UFormField label="字号">
            <UInputNumber v-model="draft.translated.fontSize" :min="12" :max="120" :step="1" :disabled="typographyDisabled" />
          </UFormField>
          <UFormField label="垂直边距">
            <UInputNumber v-model="draft.translated.marginV" :min="0" :max="300" :step="1" :disabled="typographyDisabled" />
          </UFormField>
          <UFormField label="文字颜色">
            <ColorField v-model="draft.translated.primaryColor" label="译文文字颜色" :disabled="typographyDisabled" />
          </UFormField>
          <UFormField label="描边颜色">
            <ColorField v-model="draft.translated.outlineColor" label="译文描边颜色" :disabled="typographyDisabled" />
          </UFormField>
          <UFormField label="描边宽度">
            <UInputNumber v-model="draft.translated.outlineWidth" :min="0" :max="10" :step="0.1" :disabled="typographyDisabled" />
          </UFormField>
          <UFormField label="阴影">
            <UInputNumber v-model="draft.translated.shadow" :min="0" :max="10" :step="0.1" :disabled="typographyDisabled" />
          </UFormField>
          <UFormField label="对齐">
            <USelect v-model="draft.translated.alignment" :items="alignmentItems" :disabled="typographyDisabled" />
          </UFormField>
          <div class="flex items-end gap-2">
            <USwitch v-model="draft.translated.bold" :disabled="typographyDisabled" aria-label="译文加粗" />
            <span class="pb-2 text-xs text-gray-500 dark:text-gray-400">加粗</span>
          </div>
          <div class="flex items-end gap-2">
            <USwitch v-model="draft.translated.italic" :disabled="typographyDisabled" aria-label="译文斜体" />
            <span class="pb-2 text-xs text-gray-500 dark:text-gray-400">斜体</span>
          </div>
        </div>
      </div>
    </div>

    <p class="text-[11px] leading-4 text-gray-500 dark:text-gray-400">背景颜色会与透明度叠加；内边距较小时背景框较窄。实景预览与实际导出使用同一套 ASS 样式。</p>
    <div class="grid gap-3 rounded-2xl border border-gray-200/80 p-3 dark:border-gray-800 sm:grid-cols-3">
      <UFormField label="双语行距">
        <UInputNumber v-model="draft.lineGap" :min="0" :max="120" :step="1" :disabled="outputMode !== 'bilingual' || typographyDisabled" />
      </UFormField>
      <UFormField label="背景框">
        <USwitch v-model="draft.background.enabled" :disabled="typographyDisabled" aria-label="启用字幕背景框" />
      </UFormField>
      <UFormField v-if="draft.background.enabled" label="背景透明度">
        <UInputNumber v-model="draft.background.opacity" :min="0" :max="100" :step="1" :disabled="typographyDisabled" />
      </UFormField>
      <UFormField v-if="draft.background.enabled" label="背景颜色">
        <ColorField v-model="draft.background.color" label="字幕背景颜色" :disabled="typographyDisabled" />
      </UFormField>
      <UFormField v-if="draft.background.enabled" label="内边距">
        <UInputNumber v-model="draft.background.padding" :min="0" :max="30" :step="1" :disabled="typographyDisabled" />
      </UFormField>
    </div>

    <div class="space-y-2">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <div class="min-w-0">
          <p class="text-xs font-medium text-gray-700 dark:text-gray-200">字幕预览</p>
          <p class="text-[11px] text-gray-500 dark:text-gray-400">{{ realPreviewEnabled ? '从视频抽取真实画面并烧录当前字幕样式' : '使用示例背景快速预览字号、颜色和布局' }}</p>
        </div>
        <div v-if="hasPreviewSource" class="flex items-center gap-2">
          <UButton v-if="realPreviewEnabled && realPreviewImageUrl" label="原图" icon="i-lucide-external-link" size="xs" color="neutral" variant="ghost" @click="openRealPreview" />
          <UButton v-if="realPreviewEnabled && realPreviewImageUrl" label="下载" icon="i-lucide-download" size="xs" color="neutral" variant="ghost" @click="downloadRealPreview" />
          <UButton v-if="realPreviewEnabled" label="刷新预览" icon="i-lucide-refresh-cw" size="xs" color="neutral" variant="ghost" :loading="realPreviewLoading" @click="refreshRealPreview" />
          <USwitch v-model="realPreviewEnabled" :disabled="!canRealPreview" aria-label="实景预览" />
          <span class="text-xs text-gray-600 dark:text-gray-300">实景预览</span>
        </div>
      </div>
      <p v-if="hasPreviewSource && !canRealPreview" class="text-[11px] leading-4 text-gray-500 dark:text-gray-400">{{ realPreviewDisabledReason }}</p>
      <div v-if="realPreviewEnabled && previewDuration > 0" class="flex items-center gap-3 rounded-xl border border-gray-200/70 bg-gray-50/60 px-3 py-2 dark:border-gray-800 dark:bg-gray-900/40">
        <USlider v-model="previewTime" :min="0" :max="Math.max(0.1, previewDuration)" :step="0.1" class="flex-1" aria-label="预览时间点" @change="onPreviewTimeCommit" />
        <span class="w-14 text-right font-mono text-[11px] text-gray-500 dark:text-gray-400">{{ formatPreviewTime(previewTime) }}</span>
      </div>
    </div>

    <div class="overflow-hidden rounded-2xl border border-gray-800 bg-gray-950 shadow-inner">
      <div class="relative flex aspect-video justify-center overflow-hidden bg-gradient-to-b from-gray-700 via-gray-900 to-black p-5" :class="realPreviewEnabled ? '' : previewContainerClass">
        <template v-if="realPreviewEnabled">
          <img v-if="realPreviewImageUrl" :src="realPreviewImageUrl" alt="实景字幕预览" title="点击查看完整分辨率原图" class="absolute inset-0 h-full w-full cursor-zoom-in object-contain" @click="openRealPreview" />
          <div v-else class="absolute inset-0 flex flex-col items-center justify-center gap-2 text-center text-xs text-white/60">
            <UIcon name="i-lucide-image" class="h-7 w-7" />
            <span>{{ realPreviewError || '正在准备实景预览...' }}</span>
          </div>
          <div v-if="realPreviewLoading" class="absolute inset-0 flex items-center justify-center bg-gray-950/45">
            <UIcon name="i-lucide-loader-2" class="h-6 w-6 animate-spin text-white" />
          </div>
          <div v-if="realPreviewError && realPreviewImageUrl" class="absolute inset-x-3 bottom-9 rounded-lg bg-red-950/85 px-3 py-2 text-[11px] leading-4 text-red-100">
            {{ realPreviewError }}
          </div>
          <span class="absolute bottom-2 left-3 rounded bg-black/35 px-1.5 py-0.5 text-[10px] font-medium tracking-wide text-white/70">{{ realPreviewMetaLabel }}</span>
        </template>
        <template v-else>
          <div class="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/10 to-transparent" />
          <div class="relative flex w-full flex-col items-center" :class="[previewClasses, previewInnerClass]">
            <template v-if="bilingualLayout === 'original_first'">
              <span v-if="showOriginal" :style="originalPreviewStyle" :class="previewTextClasses">This is the original subtitle.</span>
              <span v-if="showTranslated" :style="translatedPreviewStyle" :class="previewTextClasses">这是译文示例字幕。</span>
            </template>
            <template v-else>
              <span v-if="showTranslated" :style="translatedPreviewStyle" :class="previewTextClasses">这是译文示例字幕。</span>
              <span v-if="showOriginal" :style="originalPreviewStyle" :class="previewTextClasses">This is the original subtitle.</span>
            </template>
          </div>
          <span class="absolute bottom-2 left-3 text-[10px] font-medium tracking-wide text-white/35">1920 × 1080 预览</span>
        </template>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, defineComponent, h, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { SubtitleOutputStyle, SubtitleTypographyStyle } from '~~/types'
import { buildSubtitleFontOptions, createSubtitleStyle, getSubtitleStylePresetDefinition, getSubtitleStylePresetOptions, isFontInstalled, normalizeSubtitleStyle } from '~~/shared/subtitleStyles'
import { useServerFonts } from '../composables/useServerFonts'

const props = defineProps<{
  modelValue: SubtitleOutputStyle
  outputMode: 'translated' | 'bilingual' | 'original'
  subtitleFormat?: 'srt' | 'ass' | 'both'
  bilingualLayout?: 'translated_first' | 'original_first'
  previewSource?: {
    taskId?: string
    filePath?: string
    rootId?: string
  }
}>()

const emit = defineEmits<{
  'update:modelValue': [value: SubtitleOutputStyle]
}>()

const ColorField = defineComponent({
  props: {
    modelValue: { type: String, default: '#FFFFFF' },
    disabled: Boolean,
    label: { type: String, default: '颜色' }
  },
  emits: ['update:modelValue'],
  setup(fieldProps, { emit: fieldEmit }) {
    return () => h('div', { class: 'flex items-center gap-2' }, [
      h('input', {
        type: 'color',
        value: fieldProps.modelValue,
        disabled: fieldProps.disabled,
        'aria-label': `${fieldProps.label}选择器`,
        class: 'h-9 w-10 shrink-0 cursor-pointer rounded-lg border border-gray-200 bg-transparent p-0.5 disabled:cursor-not-allowed dark:border-gray-700',
        onInput: (event: Event) => fieldEmit('update:modelValue', (event.target as HTMLInputElement).value.toUpperCase())
      }),
      h('input', {
        type: 'text',
        value: fieldProps.modelValue,
        disabled: fieldProps.disabled,
        'aria-label': `${fieldProps.label}十六进制值`,
        class: 'h-9 min-w-0 flex-1 rounded-lg border border-gray-200 bg-white px-2 font-mono text-xs uppercase text-gray-700 outline-none focus:border-primary-400 disabled:bg-gray-100 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:disabled:bg-gray-900/50',
        onInput: (event: Event) => {
          const value = (event.target as HTMLInputElement).value.trim()
          if (/^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(value)) {
            fieldEmit('update:modelValue', value.startsWith('#') ? value.toUpperCase() : `#${value.toUpperCase()}`)
          }
        },
        onChange: (event: Event) => fieldEmit('update:modelValue', (event.target as HTMLInputElement).value.toUpperCase())
      })
    ])
  }
})

const draft = ref(normalizeSubtitleStyle(props.modelValue, props.outputMode))
const { fonts: serverFonts, loading: serverFontsLoading, load: loadServerFonts } = useServerFonts()
const fontOptions = computed(() => buildSubtitleFontOptions(serverFonts.value))
let syncingFromProps = false

const realPreviewEnabled = ref(false)
const realPreviewImageUrl = ref('')
const realPreviewLoading = ref(false)
const realPreviewError = ref('')
const previewTime = ref(0)
const previewDuration = ref(0)
const previewMeta = ref({ width: 0, height: 0, time: 0, duration: 0 })
let previewRequestId = 0
let previewDebounceTimer: ReturnType<typeof setTimeout> | null = null

const previewSourceKey = computed(() => `${props.previewSource?.taskId || ''}|${props.previewSource?.filePath || ''}|${props.previewSource?.rootId || ''}`)
const hasPreviewSource = computed(() => Boolean(props.previewSource && (props.previewSource.taskId || props.previewSource.filePath)))
const canRealPreview = computed(() => hasPreviewSource.value && props.subtitleFormat !== 'srt' && draft.value.presetId !== 'inherit')
const realPreviewDisabledReason = computed(() => {
  if (!props.previewSource || (!props.previewSource.taskId && !props.previewSource.filePath)) return '选择视频后可启用实景预览；设置页仅显示示例背景。'
  if (props.subtitleFormat === 'srt') return 'SRT 不保存字体和颜色，无法生成带样式的实景预览。'
  if (draft.value.presetId === 'inherit') return '“沿用原样式”暂不支持实景预览。'
  return ''
})
const realPreviewMetaLabel = computed(() => {
  const { width, height } = previewMeta.value
  return width && height ? `${width} × ${height} 实景预览` : '实景预览'
})

const presetOptions = computed(() => getSubtitleStylePresetOptions(props.outputMode))
const currentPreset = computed(() => getSubtitleStylePresetDefinition(draft.value.presetId))
const showBoth = computed(() => props.outputMode === 'bilingual')
const showOriginal = computed(() => props.outputMode !== 'translated')
const showTranslated = computed(() => props.outputMode !== 'original')
const typographyDisabled = computed(() => props.subtitleFormat === 'srt' || draft.value.presetId === 'inherit')
const displayMode = computed(() => props.outputMode === 'bilingual' ? '双语' : props.outputMode === 'original' ? '单语原文' : '单语译文')
const alignmentItems = [
  { label: '底部', value: 'bottom' },
  { label: '顶部', value: 'top' }
]

const presetId = computed({
  get: () => draft.value.presetId,
  set: (value: string) => {
    const styles = createSubtitleStyle(value, props.outputMode)
    draft.value = styles
    emit('update:modelValue', normalizeSubtitleStyle(styles, props.outputMode))
  }
})

watch(() => props.modelValue, (value) => {
  const next = normalizeSubtitleStyle(value, props.outputMode)
  if (JSON.stringify(next) === JSON.stringify(draft.value)) return
  syncingFromProps = true
  draft.value = next
  nextTick(() => { syncingFromProps = false })
}, { deep: true })

watch(draft, (value) => {
  if (syncingFromProps) return
  const normalized = normalizeSubtitleStyle(value, props.outputMode)
  emit('update:modelValue', normalized)
}, { deep: true })

function setFontFamily(target: 'original' | 'translated', family: string) {
  const value = String(family || '').trim()
  if (!value) return
  draft.value[target].fontFamily = value
}

function fontWarning(family: string) {
  if (!serverFonts.value.length || isFontInstalled(family, serverFonts.value)) return ''
  return `服务器未安装「${family}」，实景预览可能回退到其他字体`
}

function revokePreviewImage() {
  if (realPreviewImageUrl.value) URL.revokeObjectURL(realPreviewImageUrl.value)
  realPreviewImageUrl.value = ''
}

function clearPreviewSchedule() {
  if (!previewDebounceTimer) return
  clearTimeout(previewDebounceTimer)
  previewDebounceTimer = null
}

function scheduleRealPreview(time?: number) {
  if (!realPreviewEnabled.value || !canRealPreview.value) return
  clearPreviewSchedule()
  previewDebounceTimer = setTimeout(() => {
    previewDebounceTimer = null
    void requestRealPreview(time)
  }, 300)
}

async function requestRealPreview(time?: number) {
  if (!canRealPreview.value) return
  const requestId = ++previewRequestId
  realPreviewLoading.value = true
  realPreviewError.value = ''

  try {
    const source = props.previewSource!
    const body: Record<string, unknown> = {
      outputMode: props.outputMode,
      bilingualLayout: props.bilingualLayout || 'translated_first',
      subtitleStyle: normalizeSubtitleStyle(draft.value, props.outputMode)
    }
    if (source.taskId) {
      body.taskId = source.taskId
    } else {
      body.filePath = source.filePath
      body.rootId = source.rootId
    }
    if (time != null && Number.isFinite(time)) body.time = Math.max(0, time)

    const response = await fetch('/api/preview/frame', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })
    if (!response.ok) {
      const data = await response.json().catch(() => null)
      throw new Error(String(data?.message || data?.statusMessage || `实景预览生成失败 (${response.status})`))
    }

    const blob = await response.blob()
    if (requestId !== previewRequestId) return

    const nextUrl = URL.createObjectURL(blob)
    revokePreviewImage()
    realPreviewImageUrl.value = nextUrl
    const width = Number(response.headers.get('X-Preview-Width') || 0)
    const height = Number(response.headers.get('X-Preview-Height') || 0)
    const responseTime = Number(response.headers.get('X-Preview-Time') || 0)
    const duration = Number(response.headers.get('X-Preview-Duration') || 0)
    previewMeta.value = { width, height, time: responseTime, duration }
    previewDuration.value = duration
    previewTime.value = responseTime
  } catch (error: any) {
    if (requestId === previewRequestId) {
      realPreviewError.value = error?.message || '实景预览生成失败'
    }
  } finally {
    if (requestId === previewRequestId) realPreviewLoading.value = false
  }
}

function onPreviewTimeCommit() {
  void requestRealPreview(previewTime.value)
}

function refreshRealPreview() {
  if (!realPreviewEnabled.value) return
  void requestRealPreview(previewDuration.value > 0 ? previewTime.value : undefined)
}

function formatPreviewTime(seconds: number) {
  const total = Math.max(0, Math.floor(Number(seconds) || 0))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const secs = total % 60
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
    : `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
}

function openRealPreview() {
  if (!realPreviewImageUrl.value) return
  window.open(realPreviewImageUrl.value, '_blank', 'noopener,noreferrer')
}

function downloadRealPreview() {
  if (!realPreviewImageUrl.value) return
  const link = document.createElement('a')
  link.href = realPreviewImageUrl.value
  link.download = 'subx-preview.png'
  link.click()
}

onMounted(() => {
  void loadServerFonts()
})

onBeforeUnmount(() => {
  clearPreviewSchedule()
  previewRequestId += 1
  revokePreviewImage()
})

watch(realPreviewEnabled, (enabled) => {
  clearPreviewSchedule()
  previewRequestId += 1
  realPreviewLoading.value = false
  realPreviewError.value = ''
  if (!enabled) return
  previewTime.value = 0
  previewDuration.value = 0
  previewMeta.value = { width: 0, height: 0, time: 0, duration: 0 }
  revokePreviewImage()
  void requestRealPreview()
})

watch(canRealPreview, (can) => {
  if (!can) realPreviewEnabled.value = false
})

watch(previewSourceKey, () => {
  revokePreviewImage()
  previewDuration.value = 0
  previewTime.value = 0
  previewMeta.value = { width: 0, height: 0, time: 0, duration: 0 }
  if (realPreviewEnabled.value) scheduleRealPreview()
})

watch([() => JSON.stringify(draft.value), () => props.outputMode, () => props.bilingualLayout], () => {
  if (realPreviewEnabled.value) scheduleRealPreview(previewDuration.value > 0 ? previewTime.value : undefined)
})

function resetPreset() {
  draft.value = createSubtitleStyle(draft.value.presetId, props.outputMode)
}

function previewTypography(typography: SubtitleTypographyStyle) {
  const color = typography.primaryColor
  const outline = typography.outlineColor
  const width = Math.max(0, typography.outlineWidth)
  return {
    color,
    fontFamily: typography.fontFamily,
    fontSize: `${Math.max(10, Math.round(typography.fontSize * 0.48))}px`,
    fontWeight: typography.bold ? '700' : '400',
    fontStyle: typography.italic ? 'italic' : 'normal',
    WebkitTextStroke: width > 0 ? `${Math.max(0.5, width * 0.5)}px ${outline}` : undefined,
    paintOrder: 'stroke fill',
    textShadow: typography.shadow > 0 ? `0 ${Math.max(1, Math.round(typography.shadow * 1.5))}px ${Math.max(1, Math.round(typography.shadow * 2))}px rgba(0,0,0,.85)` : undefined,
    background: draft.value.background.enabled ? hexToRgba(draft.value.background.color, draft.value.background.opacity) : undefined,
    padding: draft.value.background.enabled ? `${Math.max(1, draft.value.background.padding)}px ${Math.max(2, draft.value.background.padding * 2)}px` : undefined,
    borderRadius: draft.value.background.enabled ? '4px' : undefined
  }
}

const originalPreviewStyle = computed(() => previewTypography(draft.value.original))
const translatedPreviewStyle = computed(() => previewTypography(draft.value.translated))
const previewClasses = computed(() => props.outputMode === 'bilingual' ? 'gap-1' : '')
const previewAlignment = computed(() => props.outputMode === 'original' ? draft.value.original.alignment : draft.value.translated.alignment)
const previewContainerClass = computed(() => previewAlignment.value === 'top' ? 'items-start' : 'items-end')
const previewInnerClass = computed(() => previewAlignment.value === 'top' ? 'justify-start' : 'justify-end')
const previewTextClasses = 'block max-w-full text-center leading-snug'

function hexToRgba(hex: string, opacity: number) {
  const raw = String(hex || '#000000').replace('#', '').trim()
  const value = raw.length === 3 ? raw.split('').map(char => char + char).join('') : raw
  const r = Number.parseInt(value.slice(0, 2), 16)
  const g = Number.parseInt(value.slice(2, 4), 16)
  const b = Number.parseInt(value.slice(4, 6), 16)
  const safe = [r, g, b].map(channel => Number.isFinite(channel) ? channel : 0)
  return `rgba(${safe[0]}, ${safe[1]}, ${safe[2]}, ${Math.min(1, Math.max(0, opacity / 100))})`
}
</script>
