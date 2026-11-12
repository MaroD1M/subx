import { describe, expect, it } from 'vitest'
import { parse as parseAss } from 'ass-compiler'
import { mkdtempSync, readFileSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { SubtitleService } from '../subtitle'
import { buildSubtitleFontOptions, createSubtitleStyle, getSubtitleStylePresetLabel, getSubtitleStylePresetOptions, hexToAssColor, isFontInstalled, normalizeSubtitleStyle, normalizeSubtitleStylePreset } from '../../../shared/subtitleStyles'
import { STYLE_PRESETS } from '../../../shared/stylePresets'
import type { SubtitleEntry } from '../../../types'

describe('subtitle style model', () => {
  it('normalizes legacy presets by output mode', () => {
    expect(normalizeSubtitleStylePreset('bilingual_simple', 'original')).toBe('mono_clean')
    expect(normalizeSubtitleStylePreset('bilingual_compact', 'translated')).toBe('mono_compact')
    expect(normalizeSubtitleStylePreset('mono_compact', 'bilingual')).toBe('bilingual_compact')
    expect(normalizeSubtitleStylePreset('unknown', 'bilingual')).toBe('bilingual_simple')
    expect(normalizeSubtitleStylePreset('unknown', 'translated')).toBe('mono_clean')
    expect(getSubtitleStylePresetLabel('bilingual_simple', 'original')).toBe('单语清爽（推荐）')
    expect(getSubtitleStylePresetOptions('translated').map(item => item.value)).not.toContain('bilingual_simple')
  })

  it('clamps custom typography and converts colors to ASS order', () => {
    const style = normalizeSubtitleStyle({
      presetId: 'bilingual_simple',
      original: { fontSize: 999, primaryColor: '#abc', outlineWidth: -3, marginV: 999 },
      translated: { fontSize: 8, primaryColor: 'zzz', shadow: 99 },
      lineGap: 999
    }, 'bilingual')
    expect(style.original.fontSize).toBe(120)
    expect(style.original.primaryColor).toBe('#AABBCC')
    expect(style.original.outlineWidth).toBe(0)
    expect(style.original.marginV).toBe(300)
    expect(style.translated.fontSize).toBe(12)
    expect(style.translated.primaryColor).toBe('#FFFFFF')
    expect(style.translated.shadow).toBe(10)
    expect(style.lineGap).toBe(120)
    expect(hexToAssColor('#00FF00')).toBe('&H0000FF00')
    expect(hexToAssColor('zzz', '#112233')).toBe('&H00332211')
  })

  it('sanitizes font names that would break ASS style lines', () => {
    const style = normalizeSubtitleStyle({
      presetId: 'bilingual_simple',
      original: { fontFamily: 'Arial,\nEvil,Style' },
      translated: { fontFamily: '   ' }
    }, 'bilingual')
    expect(style.original.fontFamily).toBe('Arial Evil Style')
    expect(style.translated.fontFamily).toBe('Arial')

    const longPreset = normalizeSubtitleStylePreset('x'.repeat(200), 'bilingual')
    expect(longPreset).toBe('bilingual_simple')
  })

  it('expands built-in translation styles with unique ids', () => {
    expect(STYLE_PRESETS.length).toBeGreaterThanOrEqual(20)
    expect(new Set(STYLE_PRESETS.map(preset => preset.id)).size).toBe(STYLE_PRESETS.length)
    expect(STYLE_PRESETS.every(preset => preset.name && preset.description)).toBe(true)
  })
})

describe('structured ASS output', () => {
  const entries: SubtitleEntry[] = [{
    id: '1',
    startTime: '00:00:01,000',
    endTime: '00:00:03,000',
    text: 'Hello world',
    translatedText: '你好世界'
  }]

  it('writes separate original and translated styles and events', () => {
    const style = createSubtitleStyle('bilingual_simple', 'bilingual')
    style.translated.fontFamily = 'Noto Sans CJK SC'
    style.translated.fontSize = 64
    style.translated.primaryColor = '#00FF00'
    style.original.fontFamily = 'Arial'
    style.original.fontSize = 30
    style.original.primaryColor = '#FF0000'

    const content = SubtitleService.buildStyledAssContent(entries, 'bilingual', 'translated_first', style)
    const parsed = parseAss(content) as any
    expect(parsed.styles.style).toHaveLength(2)
    const translated = parsed.styles.style.find((item: any) => item.Name === 'SubX-Translated')
    const original = parsed.styles.style.find((item: any) => item.Name === 'SubX-Original')
    expect(translated.Fontname).toBe('Noto Sans CJK SC')
    expect(original.Fontname).toBe('Arial')
    expect(Number(translated.Fontsize)).toBe(64)
    expect(Number(original.Fontsize)).toBe(30)
    expect(translated.PrimaryColour).toBe('&H0000FF00')
    expect(original.PrimaryColour).toBe('&H000000FF')
    expect(Number(translated.MarginV)).toBeGreaterThan(Number(original.MarginV))
    expect(parsed.events.dialogue).toHaveLength(2)
    expect(parsed.events.dialogue[0].Style).toBe('SubX-Translated')
    expect(parsed.events.dialogue[1].Style).toBe('SubX-Original')
  })

  it('writes background color, opacity and padding into ASS styles', () => {
    const style = createSubtitleStyle('bilingual_simple', 'bilingual')
    style.background = { enabled: true, color: '#E04242', opacity: 45, padding: 6 }

    const content = SubtitleService.buildStyledAssContent(entries, 'bilingual', 'translated_first', style)
    const parsed = parseAss(content) as any
    for (const name of ['SubX-Translated', 'SubX-Original']) {
      const item = parsed.styles.style.find((styleItem: any) => styleItem.Name === name)
      expect(item.BackColour).toBe('&H8C4242E0')
      expect(Number(item.BorderStyle)).toBe(3)
      expect(Number(item.Outline)).toBe(6)
    }
  })

  it('switches line order and margins for original-first layout', () => {
    const style = createSubtitleStyle('bilingual_cinema', 'bilingual')
    const content = SubtitleService.buildStyledAssContent(entries, 'bilingual', 'original_first', style)
    const parsed = parseAss(content) as any
    const translated = parsed.styles.style.find((item: any) => item.Name === 'SubX-Translated')
    const original = parsed.styles.style.find((item: any) => item.Name === 'SubX-Original')
    expect(parsed.events.dialogue[0].Style).toBe('SubX-Original')
    expect(parsed.events.dialogue[1].Style).toBe('SubX-Translated')
    expect(Number(original.MarginV)).toBeGreaterThan(Number(translated.MarginV))
  })

  it('keeps SRT text-only even when a visual style is supplied', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'subx-structured-srt-'))
    try {
      const outputPath = await SubtitleService.writeSubtitle(
        entries,
        join(dir, 'demo.srt'),
        'bilingual',
        'srt',
        'bilingual_simple',
        'translated_first',
        undefined,
        createSubtitleStyle('bilingual_cinema', 'bilingual')
      )
      const content = readFileSync(outputPath, 'utf-8')
      expect(content).toContain('你好世界')
      expect(content).toContain('Hello world')
      expect(content).not.toContain('SubX-Translated')
      expect(content).not.toContain('&H00')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('subtitle font options', () => {
  it('merges recommended fonts with server fonts and marks availability', () => {
    const options = buildSubtitleFontOptions(['Arial', 'Noto Sans CJK SC', 'Custom Sans'])
    const byValue = new Map(options.map(option => [option.value, option]))
    expect(byValue.get('Arial')?.installed).toBe(true)
    expect(byValue.get('Noto Sans CJK SC')?.installed).toBe(true)
    expect(byValue.get('Custom Sans')?.installed).toBe(true)
    expect(byValue.get('Custom Sans')?.description).toContain('服务器已安装')
    expect(byValue.get('Microsoft YaHei')?.installed).toBe(false)
    expect(byValue.get('Microsoft YaHei')?.description).toContain('未安装')
    expect(options.filter(option => option.value === 'Arial')).toHaveLength(1)
  })

  it('matches font families case-insensitively', () => {
    expect(isFontInstalled('noto sans cjk sc', ['Noto Sans CJK SC'])).toBe(true)
    expect(isFontInstalled('  Arial  ', ['arial'])).toBe(true)
    expect(isFontInstalled('Missing', ['Arial'])).toBe(false)
  })
})
