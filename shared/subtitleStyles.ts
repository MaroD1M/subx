import type { SubtitleOutputStyle, SubtitleTypographyStyle } from '../types'

export interface SubtitleStylePresetOption {
  label: string
  value: string
  description: string
}

export interface SubtitleStylePresetDefinition extends SubtitleStylePresetOption {
  mode: 'all' | 'bilingual' | 'mono'
  style: SubtitleOutputStyle
}

export const SUBTITLE_FONT_OPTIONS = [
  { label: 'Arial', value: 'Arial' },
  { label: 'Noto Sans CJK SC', value: 'Noto Sans CJK SC' },
  { label: 'Source Han Sans SC', value: 'Source Han Sans SC' },
  { label: 'Microsoft YaHei', value: 'Microsoft YaHei' },
  { label: 'PingFang SC', value: 'PingFang SC' },
  { label: '思源黑体', value: 'Source Han Sans CN' },
  { label: '文泉驿微米黑', value: 'WenQuanYi Micro Hei' },
  { label: 'DejaVu Sans', value: 'DejaVu Sans' }
]

function typography(overrides: Partial<SubtitleTypographyStyle> = {}): SubtitleTypographyStyle {
  return {
    fontFamily: 'Arial',
    fontSize: 48,
    primaryColor: '#FFFFFF',
    outlineColor: '#000000',
    outlineWidth: 2,
    shadow: 0.8,
    bold: false,
    italic: false,
    marginV: 24,
    alignment: 'bottom',
    ...overrides
  }
}

function style(presetId: string, original: Partial<SubtitleTypographyStyle>, translated: Partial<SubtitleTypographyStyle>, extra: Partial<SubtitleOutputStyle> = {}): SubtitleOutputStyle {
  return {
    presetId,
    original: typography(original),
    translated: typography(translated),
    lineGap: 4,
    background: {
      enabled: false,
      color: '#000000',
      opacity: 45,
      padding: 2
    },
    ...extra
  }
}

export const SUBTITLE_STYLE_PRESETS: SubtitleStylePresetDefinition[] = [
  {
    label: '简洁双语（推荐）',
    value: 'bilingual_simple',
    description: '译文清晰、原文低调，适合大多数影视作品。',
    mode: 'bilingual',
    style: style(
      'bilingual_simple',
      { fontSize: 28, primaryColor: '#C8C8C8', outlineWidth: 1, shadow: 0.35, marginV: 24 },
      { fontSize: 48, primaryColor: '#FFFFFF', outlineWidth: 2, shadow: 0.8, marginV: 28 },
      { lineGap: 4 }
    )
  },
  {
    label: '影院双语',
    value: 'bilingual_cinema',
    description: '译文更大更粗，原文更小，适合大屏与远距离观看。',
    mode: 'bilingual',
    style: style(
      'bilingual_cinema',
      { fontSize: 24, primaryColor: '#B8B8B8', outlineWidth: 1, shadow: 0.35, marginV: 34 },
      { fontSize: 56, bold: true, primaryColor: '#FFFFFF', outlineWidth: 2.5, shadow: 0.9, marginV: 40 },
      { lineGap: 4 }
    )
  },
  {
    label: '学习双语',
    value: 'bilingual_study',
    description: '原文更醒目，译文与原文接近，适合语言学习。',
    mode: 'bilingual',
    style: style(
      'bilingual_study',
      { fontSize: 34, primaryColor: '#E0E0E0', outlineWidth: 1.2, shadow: 0.45, marginV: 24 },
      { fontSize: 46, primaryColor: '#FFFFFF', outlineWidth: 1.8, shadow: 0.7, marginV: 26 },
      { lineGap: 6 }
    )
  },
  {
    label: '紧凑双语',
    value: 'bilingual_compact',
    description: '更小字号和间距，适合小屏或字幕密集的作品。',
    mode: 'bilingual',
    style: style(
      'bilingual_compact',
      { fontSize: 26, primaryColor: '#C8C8C8', outlineWidth: 1, shadow: 0.35, marginV: 18 },
      { fontSize: 42, primaryColor: '#FFFFFF', outlineWidth: 1.6, shadow: 0.6, marginV: 20 },
      { lineGap: 2 }
    )
  },
  {
    label: '单色双语',
    value: 'bilingual_mono',
    description: '原文与译文使用接近的单色，画面更统一。',
    mode: 'bilingual',
    style: style(
      'bilingual_mono',
      { fontSize: 30, primaryColor: '#D0D0D0', outlineWidth: 1.2, shadow: 0.45, marginV: 22 },
      { fontSize: 46, primaryColor: '#FFFFFF', outlineWidth: 1.8, shadow: 0.7, marginV: 24 },
      { lineGap: 3 }
    )
  },
  {
    label: '单语清爽（推荐）',
    value: 'mono_clean',
    description: '只显示一种语言，字号适中、描边清晰。',
    mode: 'mono',
    style: style(
      'mono_clean',
      { fontSize: 44, primaryColor: '#FFFFFF', outlineWidth: 2, shadow: 0.6, marginV: 24 },
      { fontSize: 44, primaryColor: '#FFFFFF', outlineWidth: 2, shadow: 0.6, marginV: 24 }
    )
  },
  {
    label: '单语紧凑',
    value: 'mono_compact',
    description: '更小字号和边距，适合字幕较多或小屏播放。',
    mode: 'mono',
    style: style(
      'mono_compact',
      { fontSize: 36, primaryColor: '#FFFFFF', outlineWidth: 1.6, shadow: 0.5, marginV: 16 },
      { fontSize: 36, primaryColor: '#FFFFFF', outlineWidth: 1.6, shadow: 0.5, marginV: 16 }
    )
  },
  {
    label: '沿用原样式',
    value: 'inherit',
    description: '保留原 ASS 样式；没有原样式时使用简洁双语。',
    mode: 'all',
    style: style(
      'inherit',
      { fontSize: 28, primaryColor: '#C8C8C8', outlineWidth: 1, shadow: 0.35, marginV: 24 },
      { fontSize: 48, primaryColor: '#FFFFFF', outlineWidth: 2, shadow: 0.8, marginV: 28 }
    )
  }
]

const PRESET_BY_VALUE = new Map(SUBTITLE_STYLE_PRESETS.map(preset => [preset.value, preset]))

function isBilingualMode(outputMode?: string) {
  return outputMode === 'bilingual'
}

export function normalizeHexColor(value: unknown, fallback = '#FFFFFF'): string {
  const raw = String(value ?? '').trim()
  const short = raw.match(/^#?([0-9a-fA-F]{3})$/)
  if (short) return `#${short[1]!.split('').map(char => char + char).join('').toUpperCase()}`
  const full = raw.match(/^#?([0-9a-fA-F]{6})(?:[0-9a-fA-F]{2})?$/)
  if (full) return `#${full[1]!.toUpperCase()}`
  return fallback
}

export function hexToAssColor(value: unknown, fallback = '#FFFFFF'): string {
  const hex = normalizeHexColor(value, fallback).slice(1)
  return `&H00${hex.slice(4, 6)}${hex.slice(2, 4)}${hex.slice(0, 2)}`
}

function clampNumber(value: unknown, fallback: number, min: number, max: number, integer = false): number {
  const parsed = Number(value)
  const safe = Number.isFinite(parsed) ? parsed : fallback
  const clamped = Math.min(max, Math.max(min, safe))
  return integer ? Math.round(clamped) : Math.round(clamped * 10) / 10
}

function normalizeTypography(input: Partial<SubtitleTypographyStyle> | undefined, fallback: SubtitleTypographyStyle): SubtitleTypographyStyle {
  const fontSource = typeof input?.fontFamily === 'string' ? input.fontFamily : fallback.fontFamily
  const fontFamily = String(fontSource || 'Arial')
    .replace(/[\r\n,]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80) || 'Arial'
  return {
    fontFamily,
    fontSize: clampNumber(input?.fontSize, fallback.fontSize, 12, 120, true),
    primaryColor: normalizeHexColor(input?.primaryColor, fallback.primaryColor),
    outlineColor: normalizeHexColor(input?.outlineColor, fallback.outlineColor),
    outlineWidth: clampNumber(input?.outlineWidth, fallback.outlineWidth, 0, 10),
    shadow: clampNumber(input?.shadow, fallback.shadow, 0, 10),
    bold: input?.bold === undefined ? fallback.bold : input.bold === true,
    italic: input?.italic === undefined ? fallback.italic : input.italic === true,
    marginV: clampNumber(input?.marginV, fallback.marginV, 0, 300, true),
    alignment: input?.alignment === 'top' ? 'top' : 'bottom'
  }
}

export function normalizeSubtitleStylePreset(value: unknown, outputMode?: string): string {
  const raw = String(value || '').trim().slice(0, 80)
  if (raw === 'inherit') return 'inherit'
  const known = PRESET_BY_VALUE.get(raw)
  if (known) {
    if (isBilingualMode(outputMode)) {
      if (known.mode === 'mono') return raw === 'mono_compact' ? 'bilingual_compact' : 'bilingual_simple'
      return raw
    }
    if (known.mode === 'bilingual') {
      return raw === 'bilingual_compact' ? 'mono_compact' : 'mono_clean'
    }
    return raw
  }
  if (raw === 'bilingual') return isBilingualMode(outputMode) ? 'bilingual_simple' : 'mono_clean'
  return isBilingualMode(outputMode) ? 'bilingual_simple' : 'mono_clean'
}

export function createSubtitleStyle(presetId?: unknown, outputMode?: string): SubtitleOutputStyle {
  const normalizedPreset = normalizeSubtitleStylePreset(presetId, outputMode)
  const definition = PRESET_BY_VALUE.get(normalizedPreset) || PRESET_BY_VALUE.get('bilingual_simple')!
  const source = JSON.parse(JSON.stringify(definition.style)) as SubtitleOutputStyle
  source.presetId = normalizedPreset
  if (!isBilingualMode(outputMode) && source.presetId !== 'inherit') {
    source.presetId = source.presetId === 'mono_compact' ? 'mono_compact' : 'mono_clean'
  }
  return source
}

export function normalizeSubtitleStyle(input: unknown, outputMode?: string): SubtitleOutputStyle {
  if (typeof input === 'string') return createSubtitleStyle(input, outputMode)
  if (!input || typeof input !== 'object') return createSubtitleStyle(undefined, outputMode)
  const raw = input as Partial<SubtitleOutputStyle>
  const presetId = normalizeSubtitleStylePreset(raw.presetId, outputMode)
  const fallback = createSubtitleStyle(presetId, outputMode)
  const background = raw.background && typeof raw.background === 'object' ? raw.background : fallback.background
  return {
    presetId,
    original: normalizeTypography(raw.original, fallback.original),
    translated: normalizeTypography(raw.translated, fallback.translated),
    lineGap: clampNumber(raw.lineGap, fallback.lineGap, 0, 120, true),
    background: {
      enabled: background?.enabled === undefined ? fallback.background.enabled : background.enabled === true,
      color: normalizeHexColor(background?.color, fallback.background.color),
      opacity: clampNumber(background?.opacity, fallback.background.opacity, 0, 100, true),
      padding: clampNumber(background?.padding, fallback.background.padding, 0, 30, true)
    }
  }
}

export function getSubtitleStylePresetOptions(outputMode?: string): SubtitleStylePresetOption[] {
  return SUBTITLE_STYLE_PRESETS
    .filter(preset => {
      if (preset.mode === 'all') return true
      if (isBilingualMode(outputMode)) return preset.mode === 'bilingual'
      return preset.mode === 'mono'
    })
    .map(({ label, value, description }) => ({ label, value, description }))
}

export function getSubtitleStylePresetLabel(value: unknown, outputMode?: string): string {
  const normalized = normalizeSubtitleStylePreset(value, outputMode)
  return PRESET_BY_VALUE.get(normalized)?.label || PRESET_BY_VALUE.get('bilingual_simple')!.label
}

export function getSubtitleStylePresetDefinition(value: unknown): SubtitleStylePresetDefinition | undefined {
  return PRESET_BY_VALUE.get(String(value || ''))
}
