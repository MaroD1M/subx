import { Converter, type ConverterFunction } from 'opencc-js'
import type { SubtitleEntry } from '../../types'

let cnToTw: ConverterFunction | null = null
let twToCn: ConverterFunction | null = null

function getConverter(toTraditional: boolean): ConverterFunction {
  if (toTraditional) {
    cnToTw ||= Converter({ from: 'cn', to: 'tw' })
    return cnToTw
  }
  twToCn ||= Converter({ from: 'tw', to: 'cn' })
  return twToCn
}

export function chineseVariantTarget(targetLanguage: string): 'zh-CN' | 'zh-TW' | null {
  const normalized = String(targetLanguage || '').trim().toLowerCase().replaceAll('_', '-')
  if (normalized === 'zh-cn' || normalized === 'zh-hans') return 'zh-TW'
  if (normalized === 'zh-tw' || normalized === 'zh-hant' || normalized === 'zh-hk') return 'zh-CN'
  return null
}

export function convertChineseText(text: string, targetLanguage: string): string {
  const target = chineseVariantTarget(targetLanguage)
  if (!target) return String(text || '')
  const converter = getConverter(target === 'zh-TW')
  return String(text || '')
    .split('\n')
    .map(line => converter(line))
    .join('\n')
}

export function buildChineseVariantEntries(entries: SubtitleEntry[], targetLanguage: string): SubtitleEntry[] {
  const target = chineseVariantTarget(targetLanguage)
  if (!target) return entries
  return entries.map(entry => ({
    ...entry,
    translatedText: entry.translatedText === undefined
      ? entry.translatedText
      : convertChineseText(String(entry.translatedText), targetLanguage)
  }))
}

export function buildChineseVariantPaths(
  outputPath: string,
  embyVariantPath: string,
  targetLanguage: string
): string[] {
  const target = chineseVariantTarget(targetLanguage)
  if (!target) return []
  const replaceLanguage = (candidate: string) => {
    if (!candidate) return ''
    const escaped = String(targetLanguage || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const pattern = new RegExp(`\\.${escaped}(?=\\.[^.]+$)`)
    if (pattern.test(candidate)) return candidate.replace(pattern, `.${target}`)
    return candidate.replace(/(\.[^.]+)$/, `.${target}$1`)
  }
  const variants = new Set<string>()
  if (embyVariantPath) {
    variants.add(replaceLanguage(embyVariantPath))
  } else {
    variants.add(replaceLanguage(outputPath))
  }
  variants.delete(outputPath)
  return [...variants].filter(Boolean)
}
