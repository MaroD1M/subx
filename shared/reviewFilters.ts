const formattingPlaceholderPattern = /__SUBX_FMT_\d+__/g

export type ReviewContentFilter =
  | 'all'
  | 'needs_attention'
  | 'untranslated'
  | 'empty'
  | 'same_as_source'
  | 'final_same_as_source'
  | 'final_differs'
  | 'latin_heavy'
  | 'overlong'

export interface ReviewFilterEntry {
  subtitleId?: string | number
  originalText?: string
  translatedText?: string
  finalText?: string
  reviewStatus?: string
  reviewReasons?: string[]
  asrConfidence?: number | null
  qualityScore?: number | null
  edited?: boolean
  selected?: boolean
}

export interface ReviewFilterOptions {
  qualityThreshold?: number
}

const normalizedTextCache = new Map<string, string>()

export function normalizeReviewText(text: unknown): string {
  const raw = String(text ?? '')
  const cached = normalizedTextCache.get(raw)
  if (cached !== undefined) return cached
  const normalizedText = raw
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .trim()
    .replace(formattingPlaceholderPattern, '')
    .replace(/<\s*br\s*\/?\s*>/gi, '\n')
    .replace(/\{[^}]+\}/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/[\s\p{P}]+/gu, '')
    .toLowerCase()
  if (normalizedTextCache.size > 10000) normalizedTextCache.clear()
  normalizedTextCache.set(raw, normalizedText)
  return normalizedText
}

function normalized(value: unknown): string {
  return normalizeReviewText(value)
}

export function isReviewTranslationEmpty(entry: ReviewFilterEntry): boolean {
  return !String(entry.translatedText || '').trim()
}

export function isReviewSameAsSource(entry: ReviewFilterEntry): boolean {
  const original = normalized(entry.originalText)
  const translated = normalized(entry.translatedText)
  return Boolean(original && translated && original === translated)
}

export function isReviewFinalSameAsSource(entry: ReviewFilterEntry): boolean {
  const original = normalized(entry.originalText)
  const finalText = normalized(entry.finalText)
  return Boolean(original && finalText && original === finalText)
}

export function isReviewFinalDiffersFromTranslation(entry: ReviewFilterEntry): boolean {
  const translated = normalized(entry.translatedText)
  if (!translated) return false
  return normalized(entry.finalText) !== translated
}

function looksLatinHeavy(text: unknown): boolean {
  const value = String(text ?? '').trim()
  if (!value) return false
  const letters = Array.from(value).filter(char => /[a-zA-Z]/.test(char)).length
  const visible = Array.from(value).filter(char => /\S/.test(char)).length
  return visible > 0 && letters / visible >= 0.7
}

export function isReviewLatinHeavy(entry: ReviewFilterEntry): boolean {
  return looksLatinHeavy(entry.originalText) && looksLatinHeavy(entry.translatedText)
}

export function isReviewOverlong(entry: ReviewFilterEntry): boolean {
  const originalLength = Array.from(normalized(entry.originalText)).length
  const translatedLength = Array.from(normalized(entry.translatedText)).length
  if (originalLength <= 0 || translatedLength <= 0) return false
  return translatedLength >= Math.max(60, originalLength * 4.8)
}

export function isReviewNeedsAttention(entry: ReviewFilterEntry, qualityThreshold = 0.7): boolean {
  if (isReviewTranslationEmpty(entry) || isReviewSameAsSource(entry)) return true
  if (['needs_review', 'fallback_original', 'missing'].includes(String(entry.reviewStatus || ''))) return true
  if (entry.qualityScore != null && Number(entry.qualityScore) < qualityThreshold) return true
  if (entry.asrConfidence != null && Number(entry.asrConfidence) < 0.6) return true
  const reasons = (entry.reviewReasons || []).filter(reason => reason !== 'same_as_source_allowed')
  return reasons.length > 0
}

export function matchesReviewContentFilter(
  entry: ReviewFilterEntry,
  filter: ReviewContentFilter,
  options: ReviewFilterOptions = {}
): boolean {
  switch (filter) {
    case 'needs_attention':
      return isReviewNeedsAttention(entry, options.qualityThreshold ?? 0.7)
    case 'untranslated':
      return isReviewTranslationEmpty(entry) || isReviewSameAsSource(entry)
    case 'empty':
      return isReviewTranslationEmpty(entry)
    case 'same_as_source':
      return isReviewSameAsSource(entry)
    case 'final_same_as_source':
      return isReviewFinalSameAsSource(entry)
    case 'final_differs':
      return isReviewFinalDiffersFromTranslation(entry)
    case 'latin_heavy':
      return isReviewLatinHeavy(entry)
    case 'overlong':
      return isReviewOverlong(entry)
    case 'all':
    default:
      return true
  }
}

export function matchesReviewSearch(entry: ReviewFilterEntry, query: string): boolean {
  const keyword = String(query || '').trim().toLowerCase()
  if (!keyword) return true
  return [
    entry.subtitleId,
    `#${entry.subtitleId ?? ''}`,
    entry.originalText,
    entry.translatedText,
    entry.finalText
  ].some(value => String(value ?? '').toLowerCase().includes(keyword))
}
