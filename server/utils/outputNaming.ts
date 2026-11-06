import { basename, dirname, join } from 'path'
import { LANGUAGE_ALIASES } from './trackPolicy'

const KNOWN_LANGUAGE_TAGS = new Set<string>(
  Object.values(LANGUAGE_ALIASES).flat().map(tag => tag.toLowerCase())
)

const LANGUAGE_TAG_PATTERN = /^([a-z]{2,})(?:[-_]([a-z]{2}|[a-z]{4}|\d{3}))?$/

const SCRIPT_CODES = new Set([
  'hans', 'hant', 'latn', 'cyrl', 'arab', 'grek', 'hebr',
  'deva', 'thai', 'jpan', 'kore', 'hani'
])

export function getMediaBaseName(filePath: string): string {
  return basename(filePath).replace(/\.[^.]+$/, '')
}

export function isKnownLanguageTag(value: string): boolean {
  const tag = String(value || '').trim().toLowerCase()
  if (!tag) return false
  if (KNOWN_LANGUAGE_TAGS.has(tag)) return true
  const match = tag.match(LANGUAGE_TAG_PATTERN)
  if (!match || !KNOWN_LANGUAGE_TAGS.has(match[1]!)) return false
  const suffix = match[2]
  if (!suffix) return true
  if (/^\d{3}$/.test(suffix)) return true
  if (suffix.length === 2) return true
  return SCRIPT_CODES.has(suffix)
}

export function stripKnownLanguageSuffix(name: string): string {
  const index = name.lastIndexOf('.')
  if (index <= 0) return name
  return isKnownLanguageTag(name.slice(index + 1)) ? name.slice(0, index) : name
}

export function deriveOutputBaseName(filePath: string, sourceType?: string): string {
  const base = getMediaBaseName(filePath)
  return sourceType === 'external' ? stripKnownLanguageSuffix(base) : base
}

export function buildOriginalSubtitleCandidates(filePath: string, sourceType?: string): string[] {
  const relativeDir = dirname(filePath)
  const outputBaseName = deriveOutputBaseName(filePath, sourceType)
  const legacyBaseName = stripKnownLanguageSuffix(getMediaBaseName(filePath))
  const bases = Array.from(new Set([`${outputBaseName}.original`, outputBaseName, legacyBaseName]))
  const extensions = ['.srt', '.ass', '.ssa']
  return bases.flatMap(base => extensions.map(ext => join(relativeDir, `${base}${ext}`)))
}
