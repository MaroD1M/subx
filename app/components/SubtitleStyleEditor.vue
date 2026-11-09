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
            <UInput v-model="draft.original.fontFamily" :list="fontListId" icon="i-lucide-type" :disabled="typographyDisabled" />
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
            <UInput v-model="draft.translated.fontFamily" :list="fontListId" icon="i-lucide-type" :disabled="typographyDisabled" />
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

    <div class="overflow-hidden rounded-2xl border border-gray-800 bg-gray-950 shadow-inner">
      <div class="relative flex aspect-video justify-center overflow-hidden bg-gradient-to-b from-gray-700 via-gray-900 to-black p-5" :class="previewContainerClass">
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
      </div>
    </div>
    <datalist :id="fontListId">
      <option v-for="font in SUBTITLE_FONT_OPTIONS" :key="font.value" :value="font.value">{{ font.label }}</option>
    </datalist>
  </div>
</template>

<script setup lang="ts">
import { computed, defineComponent, h, nextTick, ref, useId, watch } from 'vue'
import type { SubtitleOutputStyle, SubtitleTypographyStyle } from '~~/types'
import { SUBTITLE_FONT_OPTIONS, createSubtitleStyle, getSubtitleStylePresetDefinition, getSubtitleStylePresetOptions, normalizeSubtitleStyle } from '~~/shared/subtitleStyles'

const props = defineProps<{
  modelValue: SubtitleOutputStyle
  outputMode: 'translated' | 'bilingual' | 'original'
  subtitleFormat?: 'srt' | 'ass' | 'both'
  bilingualLayout?: 'translated_first' | 'original_first'
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
        onChange: (event: Event) => fieldEmit('update:modelValue', (event.target as HTMLInputElement).value.toUpperCase())
      })
    ])
  }
})

const draft = ref(normalizeSubtitleStyle(props.modelValue, props.outputMode))
const fontListId = `subx-font-options-${useId()}`
let syncingFromProps = false

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
  const value = String(hex || '#000000').replace('#', '')
  const r = parseInt(value.slice(0, 2), 16)
  const g = parseInt(value.slice(2, 4), 16)
  const b = parseInt(value.slice(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${Math.min(1, Math.max(0, opacity / 100))})`
}
</script>
