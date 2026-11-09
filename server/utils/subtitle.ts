import SrtParser from 'srt-parser-2'
import { parse as parseAss, stringify as stringifyAss } from 'ass-compiler'
import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync, unlinkSync } from 'fs'
import * as chardet from 'chardet'
import iconv from 'iconv-lite'
import { createHash } from 'crypto'
import { join } from 'path'
import type { SubtitleEntry, SubtitleOutputStyle, SubtitleTypographyStyle } from '../../types'
import { hexToAssColor, normalizeSubtitleStyle } from '../../shared/subtitleStyles'
import { useDb } from './db'
import { resolveMediaPath } from './mediaRoots'
import { SubtitleFormatting, formattingPlaceholderPattern, type FormattingTarget, type FormattingToken } from './subtitleFormatting'

const srtParser = new SrtParser()

function atomicWriteFile(filePath: string, content: string) {
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`
  try {
    writeFileSync(tempPath, content, 'utf-8')
    renameSync(tempPath, filePath)
  } catch (error) {
    try { unlinkSync(tempPath) } catch { /* ignore cleanup failure */ }
    throw error
  }
}
const ASS_TEXT_SAMPLE_HEADER = `[Script Info]\nScriptType: V4.00+\n\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\nStyle: Default,Arial,48,&H00FFFFFF,&H000000FF,&H00000000,&H64000000,0,0,0,0,100,100,0,0,1,2,0.8,2,30,30,24,1\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\nDialogue: 0,0:00:00.00,0:00:01.00,Default,,0,0,0,,`


type OutputMode = 'translated' | 'bilingual' | 'original'
type SubtitleFormat = 'srt' | 'ass' | 'both'
type BilingualLayout = 'translated_first' | 'original_first'
type TranslationValidationIssue = { id: string, reason: 'missing' | 'same_as_source' | 'latin_heavy' | 'bilingual_duplicate' | 'same_as_source_allowed' | 'suspected_contamination' | 'overlong_translation' | 'suspected_shift', original: string, translated: string, severity?: 'soft' | 'hard' }

export async function safePath(userPath: string, rootId?: string | null): Promise<string> {
  return resolveMediaPath(userPath, rootId)
}

function readSubtitleFile(filePath: string): string {
  const buffer = readFileSync(filePath)
  if (buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
    return buffer.subarray(3).toString('utf-8')
  }
  if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) {
    return iconv.decode(buffer.subarray(2), 'utf16-le')
  }
  if (buffer.length >= 2 && buffer[0] === 0xfe && buffer[1] === 0xff) {
    return iconv.decode(buffer.subarray(2), 'utf16-be')
  }

  const detected = String(chardet.detect(buffer) || 'UTF-8').toLowerCase()
  if (detected === 'utf-8' || detected === 'ascii' || detected === 'utf8') {
    return buffer.toString('utf-8')
  }

  try {
    if (!iconv.encodingExists(detected)) return buffer.toString('utf-8')
    const decoded = iconv.decode(buffer, detected)
    const replacementCount = (decoded.match(/\uFFFD/g) || []).length
    if (replacementCount > Math.max(2, Math.floor(decoded.length * 0.01))) {
      return buffer.toString('utf-8')
    }
    return decoded
  } catch {
    return buffer.toString('utf-8')
  }
}

function normalizeVttTime(raw: string): string {
  const match = String(raw || '').trim().match(/^(?:(\d+):)?(\d{1,2}):(\d{2})[.,](\d{3})$/)
  if (!match) return ''
  const [, hh = '0', mm, ss, ms] = match
  return `${String(Number(hh)).padStart(2, '0')}:${String(Number(mm)).padStart(2, '0')}:${String(Number(ss)).padStart(2, '0')},${ms}`
}

export const SubtitleService = {
  ...SubtitleFormatting,
  isNonVerbal(text: string): boolean {
    const trimmed = text.trim()
    if (!trimmed) return true
    if (/^[\*\-\.，。！？、…\s]+$/.test(trimmed)) return true
    return false
  },

  isLowValueText(text: string): boolean {
    const normalized = this.normalizeComparisonText(text)
    if (!normalized) return true
    if (/^(ha|ah|oh|uh|um|hmm|mm|ok|okay|yeah|yes|no|hey|yo)+$/i.test(normalized)) return true
    if (/^[啊哦嗯呃欸唉哎哈嘿喂诶噢好呀嘛呢啦哦哇]+$/u.test(normalized)) return true
    if (normalized.length <= 2) return true
    if (this.isLikelyMetadataOrProperNoun(text)) return true
    if (this.isLikelySongLyric(text)) return true
    return false
  },

  countDialogueLines(text: string): number {
    return this.normalizeSubtitleText(text)
      .split('\n')
      .map(line => line.trim())
      .filter(Boolean)
      .filter(line => !/^[\[\(（【].*[\]\)）】]$/.test(line)).length
  },

  isLikelyContaminatedTranslation(original: string, translated: string): boolean {
    const normalizedOriginal = this.normalizeComparisonText(original)
    const normalizedTranslated = this.normalizeComparisonText(translated)
    if (!normalizedOriginal || !normalizedTranslated) return false

    const originalLines = this.countDialogueLines(original)
    const translatedLines = this.countDialogueLines(translated)
    const originalLength = Array.from(normalizedOriginal).length
    const translatedLength = Array.from(normalizedTranslated).length
    const ratio = translatedLength / Math.max(originalLength, 1)
    const dialoguePrefixes = (this.normalizeSubtitleText(translated).match(/^\s*[-—–]\s+/gm) || []).length

    if (originalLines <= 1 && translatedLines >= 3 && dialoguePrefixes >= 2) return true
    if (originalLines <= 2 && translatedLines >= originalLines + 2 && ratio > 3.2) return true
    if (originalLength > 0 && translatedLength >= Math.max(40, originalLength * 3.8) && translatedLines >= Math.max(3, originalLines + 2)) return true

    return false
  },

  isChineseTarget(targetLanguage: string): boolean {
    return /^zh(?:[-_]|$)/i.test(String(targetLanguage || ''))
  },

  isChineseVariantConversion(targetLanguage: string, original: string, translated: string): boolean {
    if (!this.isChineseTarget(targetLanguage)) return false
    return this.containsCjk(original) && this.containsCjk(translated)
  },

  containsCjk(text: unknown): boolean {
    return /[㐀-鿿豈-﫿]/u.test(this.normalizeSubtitleText(text))
  },

  isBracketOnlyText(text: string): boolean {
    const normalized = this.normalizeSubtitleText(text)
    return /^[（(【\[].+[）)】\]]$/u.test(normalized)
  },

  isNumericLikeText(text: string): boolean {
    const normalized = this.normalizeComparisonText(text)
    return !!normalized && /^[\d零一二三四五六七八九十百千万年月日号集季篇章上下前后]+$/u.test(normalized)
  },

  isLikelyMetadataOrProperNoun(text: string): boolean {
    const normalized = this.normalizeSubtitleText(text)
    if (!normalized) return true
    if (this.isBracketOnlyText(normalized)) return true
    if (this.isNumericLikeText(normalized)) return true
    if (/^[A-Z0-9 .,:;!?&'\-]+$/i.test(normalized) && normalized.length <= 24) return true
    if (/^[\p{Script=Han}A-Za-z0-9·•・\-—：:（）()《》〈〉「」『』【】\s]+$/u.test(normalized) && normalized.length <= 8) return true
    return false
  },

  isLikelySongLyric(text: string): boolean {
    const normalized = this.normalizeSubtitleText(text)
    if (!normalized) return false
    if (/[♪♫♬♩]/u.test(normalized)) return true
    if (/(?:（唱|\(sing|\[music\]|\[singing\])/iu.test(normalized)) return true
    const lines = normalized.split('\n').map(line => line.trim()).filter(Boolean)
    if (lines.length >= 2 && lines.every(line => line.length <= 12)) return true
    return false
  },

  isAcceptableSameText(original: string, translated: string, targetLanguage: string): boolean {
    const normalizedOriginal = this.normalizeComparisonText(original)
    const normalizedTranslated = this.normalizeComparisonText(translated)
    if (!normalizedOriginal || normalizedOriginal !== normalizedTranslated) return false
    if (this.isLowValueText(original)) return true
    if (this.isLikelyMetadataOrProperNoun(original)) return true
    if (this.isLikelySongLyric(original)) return true
    if (this.isChineseVariantConversion(targetLanguage, original, translated)) return true

    const originalText = this.normalizeSubtitleText(original)
    const translatedText = this.normalizeSubtitleText(translated)
    const originalLines = originalText.split('\n').map(line => line.trim()).filter(Boolean)
    const translatedLines = translatedText.split('\n').map(line => line.trim()).filter(Boolean)
    const allBracketOnly = originalLines.length > 0 && originalLines.every(line => this.isBracketOnlyText(line))

    if (allBracketOnly && translatedLines.length === originalLines.length) return true
    return false
  },

  extractLeadingCueTag(text: unknown): { prefixTag: string, body: string } {
    const normalized = this.normalizeSubtitleText(text)
    const match = normalized.match(/^((?:\{\\[^}]+\}\s*)+)/)
    if (!match) {
      return { prefixTag: '', body: normalized }
    }

    return {
      prefixTag: match[1]!.trim(),
      body: normalized.slice(match[0].length).trim()
    }
  },

   parseVttContent(content: string): SubtitleEntry[] {
    const normalized = String(content || '').replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n')
    const blocks = normalized.split(/\n\s*\n+/)
    const entries: SubtitleEntry[] = []

    for (const block of blocks) {
      const lines = block.split('\n').map(line => line.trimEnd())
      const firstLine = (lines[0] || '').trim()
      if (!firstLine || /^WEBVTT/i.test(firstLine) || /^(NOTE|STYLE|REGION)\b/i.test(firstLine)) continue

      const timestampIndex = lines.findIndex(line => line.includes('-->'))
      if (timestampIndex < 0) continue

      const [startRaw, endRaw] = lines[timestampIndex]!.split('-->').map(part => part.trim())
      const startTime = normalizeVttTime(startRaw || '')
      const endTime = normalizeVttTime(String(endRaw || '').split(/\s+/)[0] || '')
      if (!startTime || !endTime) continue

      const textLines = lines.slice(timestampIndex + 1)
        .join('\n')
        .replace(/<\/?(?:c|v|lang|ruby|rt)[^>]*>/gi, '')
        .trim()
      if (!textLines) continue

      const { prefixTag, body } = this.extractLeadingCueTag(textLines)
      const protectedBody = this.protectFormattingTokens(body)
      entries.push({
        id: String(entries.length + 1),
        startTime,
        endTime,
        text: protectedBody.text,
        prefixTag: prefixTag || undefined,
        formattingTokens: protectedBody.formattingTokens.length > 0 ? protectedBody.formattingTokens : undefined
      })
    }

    return entries
  },

   async parseSubtitle(filePath: string): Promise<SubtitleEntry[]> {
    const content = readSubtitleFile(filePath)
    const extension = filePath.split('.').pop()?.toLowerCase()

    let entries: SubtitleEntry[]

    if (extension === 'ass' || extension === 'ssa') {
      const parsed = parseAss(content)
      entries = parsed.events.dialogue.map((event, index) => {
        const rawText = typeof event.Text === 'string'
          ? event.Text
          : ((event.Text as any).raw || (event.Text as any).combined || JSON.stringify(event.Text))

        const normalizedRaw = String(rawText).replace(/\\[nN]/g, '\n')

        if (this.shouldPreserveAssRawText(normalizedRaw)) {
          return {
            id: (index + 1).toString(),
            startTime: this.assSecondsToSrtTime(event.Start),
            endTime: this.assSecondsToSrtTime(event.End),
            text: normalizedRaw
          }
        }

        const { prefixTag, body } = this.extractLeadingCueTag(normalizedRaw)
        const protectedBody = this.protectFormattingTokens(body)

        return {
          id: (index + 1).toString(),
          startTime: this.assSecondsToSrtTime(event.Start),
          endTime: this.assSecondsToSrtTime(event.End),
          text: protectedBody.text,
          prefixTag: prefixTag || undefined,
          formattingTokens: protectedBody.formattingTokens.length > 0 ? protectedBody.formattingTokens : undefined
        }
      })
    } else if (extension === 'vtt') {
      entries = this.parseVttContent(content)
    } else {
      const srtEntries = srtParser.fromSrt(content)
      entries = srtEntries.map(entry => {
        const { prefixTag, body } = this.extractLeadingCueTag(entry.text)
        const protectedBody = this.protectFormattingTokens(body)
        return {
          id: entry.id,
          startTime: entry.startTime,
          endTime: entry.endTime,
          text: protectedBody.text,
          prefixTag: prefixTag || undefined,
          formattingTokens: protectedBody.formattingTokens.length > 0 ? protectedBody.formattingTokens : undefined
        }
      })
    }

    return entries
  },

  assSecondsToSrtTime(assSeconds: number): string {
    return this.msToSrtTime(Math.round(assSeconds * 1000))
  },

  srtTimeToMs(time: string): number {
    const match = String(time || '').match(/^(\d{2}):(\d{2}):(\d{2})[,\.](\d{3})$/)
    if (!match) return 0
    const [, hh, mm, ss, ms] = match
    return Number(hh) * 3600000 + Number(mm) * 60000 + Number(ss) * 1000 + Number(ms)
  },

  msToSrtTime(totalMs: number): string {
    const safeMs = Math.max(0, totalMs)
    const hrs = Math.floor(safeMs / 3600000)
    const mins = Math.floor((safeMs % 3600000) / 60000)
    const secs = Math.floor((safeMs % 60000) / 1000)
    const ms = safeMs % 1000
    return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')},${ms.toString().padStart(3, '0')}`
  },

  msToAssSeconds(totalMs: number): number {
    return Math.round(Math.max(0, totalMs) / 10) / 100
  },

  getDisplayText(entry: SubtitleEntry, outputMode: OutputMode, bilingualLayout: BilingualLayout): string {
    const originalText = String(entry.text ?? '')
    const preservedAssRawText = entry.prefixTag ? `${entry.prefixTag}${originalText}` : originalText
    const shouldPreserveRawText = this.shouldPreserveAssRawText(preservedAssRawText)
    const stabilizedTranslatedText = this.stabilizeFormattingPlaceholders(
      entry.translatedText ?? entry.text ?? '',
      originalText,
      entry.formattingTokens || []
    )
    const translatedText = shouldPreserveRawText
      ? this.normalizeSubtitleText(stabilizedTranslatedText)
      : this.normalizeModelOutputText(stabilizedTranslatedText)

    if (outputMode === 'original') {
      return originalText
    }

    if (outputMode === 'bilingual' && entry.translatedText) {
      return bilingualLayout === 'original_first'
        ? `${originalText}\n${translatedText}`
        : `${translatedText}\n${originalText}`
    }

    return translatedText
  },

  normalizeComparisonText(text: unknown): string {
    return this.normalizeSubtitleText(text)
      .replace(formattingPlaceholderPattern, '')
      .replace(/<\s*br\s*\/?\s*>/gi, '\n')
      .replace(/\{[^}]+\}/g, '')
      .replace(/<[^>]+>/g, '')
      .replace(/[\s\p{P}]+/gu, '')
      .toLowerCase()
  },

  looksLatinHeavy(text: unknown): boolean {
    const normalized = this.normalizeSubtitleText(text)
    if (!normalized) return false
    const letters = Array.from(normalized).filter(char => /[a-zA-Z]/.test(char)).length
    const visible = Array.from(normalized).filter(char => /\S/.test(char)).length
    return visible > 0 && letters / visible >= 0.7
  },

  splitBilingualLines(text: unknown): string[] {
    return this.normalizeSubtitleText(text)
      .split('\n')
      .map(line => line.trim())
      .filter(Boolean)
  },

  dedupeRepeatedLines(text: unknown): string {
    const lines = this.splitBilingualLines(text)
    if (lines.length <= 1) return this.normalizeSubtitleText(text)

    const deduped = []
    let previousKey = ''
    for (const line of lines) {
      const key = this.normalizeComparisonText(line)
      if (!key || key !== previousKey) {
        deduped.push(line)
        previousKey = key
      }
    }

    return deduped.join('\n')
  },

  removeOriginalFromBilingualTail(original: string, translated: string): string {
    const originalKey = this.normalizeComparisonText(original)
    const lines = this.splitBilingualLines(translated)
    if (lines.length <= 1 || !originalKey) return this.normalizeSubtitleText(translated)

    const filtered = lines.filter((line, index) => {
      if (index === 0) return true
      return this.normalizeComparisonText(line) !== originalKey
    })

    return filtered.join('\n')
  },

  repairTranslatedText(entry: SubtitleEntry, targetLanguage: string, outputMode: OutputMode = 'translated'): { text: string, fallbackUsed: boolean, reasons: string[] } {
    const reasons: string[] = []
    const original = String(entry.text || '')
    let translated = String(entry.translatedText || '')

    translated = this.dedupeRepeatedLines(translated)
    translated = this.removeOriginalFromBilingualTail(original, translated)

    const stabilized = this.stabilizeFormattingPlaceholders(translated, original, entry.formattingTokens || [])
    const normalizedTranslated = this.normalizeModelOutputText(stabilized)
    const normalizedOriginal = this.normalizeComparisonText(original)
    const normalizedOutput = this.normalizeComparisonText(normalizedTranslated)
    const shouldCheckLatinHeavy = /^zh|^ja|^ko/i.test(targetLanguage)

    if (!normalizedOutput) {
      reasons.push('missing')
      return { text: original, fallbackUsed: true, reasons }
    }

    if (normalizedOriginal && normalizedOriginal === normalizedOutput) {
      if (this.isAcceptableSameText(original, normalizedTranslated, targetLanguage)) {
        reasons.push('same_as_source_allowed')
        return { text: normalizedTranslated || original, fallbackUsed: false, reasons }
      }
      reasons.push('same_as_source')
      return { text: original, fallbackUsed: true, reasons }
    }

    const bilingualLines = this.splitBilingualLines(normalizedTranslated)
    if (outputMode === 'bilingual' && bilingualLines.length >= 2) {
      const first = this.normalizeComparisonText(bilingualLines[0])
      const second = this.normalizeComparisonText(bilingualLines[1])
      if (first && second && first === second) {
        reasons.push('bilingual_duplicate')
        return { text: bilingualLines[0]!, fallbackUsed: false, reasons }
      }
    }

    if (shouldCheckLatinHeavy && this.looksLatinHeavy(normalizedTranslated) && this.looksLatinHeavy(original) && !this.isLikelySongLyric(original)) {
      reasons.push('latin_heavy')
      return { text: original, fallbackUsed: true, reasons }
    }

    return { text: normalizedTranslated, fallbackUsed: false, reasons }
  },

  repairTranslatedEntries(entries: SubtitleEntry[], targetLanguage: string, outputMode: OutputMode = 'translated'): { entries: SubtitleEntry[], repaired: number, fallbacked: number, issueCounts: Record<string, number> } {
    let repaired = 0
    let fallbacked = 0
    const issueCounts: Record<string, number> = {}

    const nextEntries = entries.map(entry => {
      if (this.isNonVerbal(entry.text) || outputMode === 'original') return entry

      const repairedResult = this.repairTranslatedText(entry, targetLanguage, outputMode)
      if (repairedResult.reasons.length > 0) {
        repaired += 1
        if (repairedResult.fallbackUsed) fallbacked += 1
        for (const reason of repairedResult.reasons) {
          issueCounts[reason] = (issueCounts[reason] || 0) + 1
        }
      }

      return {
        ...entry,
        translatedText: repairedResult.text
      }
    })

    return { entries: nextEntries, repaired, fallbacked, issueCounts }
  },

  validateTranslatedEntries(entries: SubtitleEntry[], targetLanguage: string): TranslationValidationIssue[] {
    const normalizedEntries = entries.map(entry => ({
      original: this.normalizeComparisonText(entry.text || ''),
      translated: this.normalizeComparisonText(entry.translatedText || '')
    }))
    const shouldCheckLatinHeavy = /^zh|^ja|^ko/i.test(targetLanguage)
    const issues: TranslationValidationIssue[] = []

    for (const entry of entries) {
      if (this.isNonVerbal(entry.text)) continue
      const original = String(entry.text || '')
      const translated = String(entry.translatedText || '')
      const normalizedOriginal = this.normalizeComparisonText(original)
      const normalizedTranslated = this.normalizeComparisonText(translated)

      if (!normalizedTranslated) {
        issues.push({ id: String(entry.id), reason: 'missing', original, translated, severity: this.isLowValueText(original) ? 'soft' : 'hard' })
        continue
      }

      if (normalizedOriginal && normalizedOriginal === normalizedTranslated) {
        if (this.isAcceptableSameText(original, translated, targetLanguage)) {
          continue
        }
        issues.push({ id: String(entry.id), reason: 'same_as_source', original, translated, severity: this.isLowValueText(original) ? 'soft' : 'hard' })
        continue
      }

      if (this.isLikelyContaminatedTranslation(original, translated)) {
        issues.push({ id: String(entry.id), reason: 'suspected_contamination', original, translated, severity: 'hard' })
        continue
      }

      const currentIndex = entries.findIndex(item => String(item.id) === String(entry.id))
      const previousOriginal = currentIndex > 0 ? normalizedEntries[currentIndex - 1]?.original || '' : ''
      const nextOriginal = currentIndex + 1 < normalizedEntries.length ? normalizedEntries[currentIndex + 1]?.original || '' : ''
      if (normalizedTranslated && normalizedOriginal && normalizedTranslated !== normalizedOriginal) {
        const matchesPrevious = previousOriginal && normalizedTranslated === previousOriginal
        const matchesNext = nextOriginal && normalizedTranslated === nextOriginal
        if (matchesPrevious || matchesNext) {
          issues.push({ id: String(entry.id), reason: 'suspected_shift', original, translated, severity: 'hard' })
          continue
        }
      }

      if (shouldCheckLatinHeavy && this.looksLatinHeavy(translated) && this.looksLatinHeavy(original) && !this.isLikelySongLyric(original)) {
        issues.push({ id: String(entry.id), reason: 'latin_heavy', original, translated, severity: this.isLowValueText(original) ? 'soft' : 'hard' })
        continue
      }

      const normalizedOriginalLength = Array.from(normalizedOriginal).length
      const normalizedTranslatedLength = Array.from(normalizedTranslated).length
      if (normalizedOriginalLength > 0 && normalizedTranslatedLength >= Math.max(60, normalizedOriginalLength * 4.8)) {
        issues.push({ id: String(entry.id), reason: 'overlong_translation', original, translated, severity: 'hard' })
      }
    }

    return issues
  },

  normalizeEntries(entries: SubtitleEntry[], outputMode: OutputMode, bilingualLayout: BilingualLayout) {
    return entries.map(entry => ({
      id: String(entry.id),
      startMs: this.srtTimeToMs(String(entry.startTime)),
      endMs: this.srtTimeToMs(String(entry.endTime)),
      text: this.sanitizeSrtText(this.getDisplayText(entry, outputMode, bilingualLayout)),
      prefixTag: entry.prefixTag || '',
      formattingTokens: entry.formattingTokens || []
    }))
  },

  normalizeSubtitleText(text: unknown): string {
    return String(text ?? '')
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .trim()
  },

  sanitizeSrtText(text: unknown): string {
    return this.normalizeSubtitleText(text)
      .replace(/<\s*br\s*\/?\s*>/gi, '\n')
      .replace(/<\/?\s*(i|b|u)\s*>/gi, '')
      .replace(/<\s*font[^>]*>/gi, '')
      .replace(/<\s*\/\s*font\s*>/gi, '')
  },

  buildSrtText(text: unknown, prefixTag = '', formattingTokens: FormattingToken[] = []): string {
    const restored = this.restoreFormattingTokens(text, formattingTokens, 'srt')
    const normalized = this.sanitizeSrtText(restored)
    return prefixTag ? `${prefixTag}${normalized}` : normalized
  },

  buildBilingualAssTextPayload(entry: SubtitleEntry, bilingualLayout: BilingualLayout, subtitleStylePreset = 'bilingual_simple', prefixTag = '', formattingTokens: FormattingToken[] = []) {
    const originalText = this.normalizeSubtitleText(entry.text)
    const translatedBase = this.stabilizeFormattingPlaceholders(
      entry.translatedText ?? entry.text ?? '',
      originalText,
      formattingTokens
    )
    const translatedText = this.normalizeModelOutputText(translatedBase)
    const restoredTranslated = this.restoreFormattingTokens(translatedText, formattingTokens, 'ass').replace(/\n/g, '\\N')
    const restoredOriginal = this.restoreFormattingTokens(originalText, formattingTokens, 'ass').replace(/\n/g, '\\N')

    const isCinema = subtitleStylePreset.includes('cinema')
    const isStudy = subtitleStylePreset.includes('study')
    const isCompact = subtitleStylePreset.includes('compact')
    const isMono = subtitleStylePreset.includes('mono')

    const translatedSize = isCinema ? 54 : isStudy ? 46 : isCompact ? 40 : 48
    const originalSize = isCinema ? 24 : isStudy ? 34 : isCompact ? 26 : 28
    const originalColor = isCinema ? '&H00B8B8B8&' : isStudy ? '&H00D8D8D8&' : '&H00C8C8C8&'
    const translatedBorder = isCinema ? '2.4' : isCompact ? '1.6' : '2'
    const originalBorder = isStudy ? '1.2' : '1'
    const translatedShadow = isMono ? '0.5' : isCinema ? '0.9' : '0.8'
    const originalShadow = isStudy ? '0.45' : '0.35'

    const inheritStyle = subtitleStylePreset === 'inherit'
    const translatedStyled = inheritStyle
      ? restoredTranslated
      : `{\\fs${translatedSize}\\bord${translatedBorder}\\shad${translatedShadow}}${restoredTranslated}`
    const originalStyled = inheritStyle
      ? restoredOriginal
      : `{\\fs${originalSize}\\c${originalColor}\\bord${originalBorder}\\shad${originalShadow}}${restoredOriginal}`
    const lines = bilingualLayout === 'original_first'
      ? [originalStyled, translatedStyled]
      : [translatedStyled, originalStyled]
    return this.parseAssTextPayload(`${prefixTag}${lines.join('\\N')}`)
  },
  parseAssTextPayload(rawText: string) {
    const parsed = parseAss(`${ASS_TEXT_SAMPLE_HEADER}${rawText}`)
    const textPayload = (parsed.events.dialogue[0] as any)?.Text
    if (textPayload?.parsed) {
      return textPayload
    }

    return {
      raw: rawText,
      combined: rawText,
      parsed: [{ tags: [], text: rawText, drawing: [] }]
    }
  },

  buildAssTextPayload(text: unknown, prefixTag = '', formattingTokens: FormattingToken[] = []) {
    const normalized = this.normalizeModelOutputText(text)
    const restored = this.restoreFormattingTokens(normalized, formattingTokens, 'ass')
    const assRawText = `${prefixTag}${restored.replace(/\n/g, '\\N')}`
    return this.parseAssTextPayload(assRawText)
  },

  buildAssStyle(subtitleStylePreset = 'bilingual_simple') {
    const isCinema = subtitleStylePreset.includes('cinema')
    const isStudy = subtitleStylePreset.includes('study')
    const isCompact = subtitleStylePreset.includes('compact')
    const isMono = subtitleStylePreset.includes('mono')

    return {
      Name: 'Default',
      Fontname: 'Arial',
      Fontsize: isCinema ? '56' : isCompact ? '42' : isStudy ? '46' : '48',
      PrimaryColour: '&H00FFFFFF',
      SecondaryColour: '&H000000FF',
      OutlineColour: '&H00000000',
      BackColour: '&H64000000',
      Bold: isCinema ? '-1' : '0',
      Italic: '0',
      Underline: '0',
      StrikeOut: '0',
      ScaleX: '100',
      ScaleY: '100',
      Spacing: '0',
      Angle: '0',
      BorderStyle: '1',
      Outline: isCinema ? '2.5' : '2',
      Shadow: isMono ? '0.5' : '0.8',
      Alignment: '2',
      MarginL: '30',
      MarginR: '30',
      MarginV: isCinema ? '40' : '24',
      Encoding: '1'
    }
  },

  buildStyledAssStyle(name: string, typography: SubtitleTypographyStyle, marginV: number, background: SubtitleOutputStyle['background']): any {
    const alpha = Math.round((1 - Math.min(100, Math.max(0, Number(background?.opacity ?? 45))) / 100) * 255).toString(16).padStart(2, '0').toUpperCase()
    return {
      Name: name,
      Fontname: typography.fontFamily || 'Arial',
      Fontsize: String(typography.fontSize),
      PrimaryColour: hexToAssColor(typography.primaryColor),
      SecondaryColour: '&H000000FF',
      OutlineColour: hexToAssColor(typography.outlineColor),
      BackColour: `&H${alpha}${hexToAssColor(background?.color, '#000000').slice(4)}`,
      Bold: typography.bold ? '-1' : '0',
      Italic: typography.italic ? '-1' : '0',
      Underline: '0',
      StrikeOut: '0',
      ScaleX: '100',
      ScaleY: '100',
      Spacing: '0',
      Angle: '0',
      BorderStyle: background?.enabled ? '3' : '1',
      Outline: background?.enabled ? String(Math.max(1, Number(background.padding) || 1)) : String(typography.outlineWidth),
      Shadow: String(typography.shadow),
      Alignment: typography.alignment === 'top' ? '8' : '2',
      MarginL: '30',
      MarginR: '30',
      MarginV: String(Math.max(0, Math.round(marginV))),
      Encoding: '1'
    }
  },

  buildStyledAssStyles(subtitleStyle: SubtitleOutputStyle, outputMode: OutputMode, bilingualLayout: BilingualLayout) {
    const style = normalizeSubtitleStyle(subtitleStyle, outputMode)
    if (outputMode !== 'bilingual') {
      const typography = outputMode === 'original' ? style.original : style.translated
      const name = outputMode === 'original' ? 'SubX-Original' : 'SubX-Translated'
      return [this.buildStyledAssStyle(name, typography, typography.marginV, style.background)]
    }

    const translatedFirst = bilingualLayout !== 'original_first'
    const original = { ...style.original }
    const translated = { ...style.translated }
    let originalMargin = original.marginV
    let translatedMargin = translated.marginV
    if (original.alignment === translated.alignment) {
      const alignment = translated.alignment
      if (alignment === 'bottom') {
        if (translatedFirst) translatedMargin = original.marginV + original.fontSize + style.lineGap
        else originalMargin = translated.marginV + translated.fontSize + style.lineGap
      } else if (translatedFirst) {
        originalMargin = translated.marginV + translated.fontSize + style.lineGap
      } else {
        translatedMargin = original.marginV + original.fontSize + style.lineGap
      }
    }

    return [
      this.buildStyledAssStyle('SubX-Translated', translated, translatedMargin, style.background),
      this.buildStyledAssStyle('SubX-Original', original, originalMargin, style.background)
    ]
  },

  buildStyledAssContent(entries: SubtitleEntry[], outputMode: OutputMode, bilingualLayout: BilingualLayout, subtitleStyle: SubtitleOutputStyle): string {
    const style = normalizeSubtitleStyle(subtitleStyle, outputMode)
    const styles = this.buildStyledAssStyles(style, outputMode, bilingualLayout)
    const dialogue: any[] = []

    const makeDialogue = (entry: SubtitleEntry, styleName: string, text: string, startMs: number, endMs: number) => ({
      Layer: 0,
      Start: this.msToAssSeconds(startMs),
      End: this.msToAssSeconds(endMs),
      Style: styleName,
      Name: '',
      MarginL: 0,
      MarginR: 0,
      MarginV: 0,
      Effect: null,
      Text: this.buildAssTextPayload(text, '', entry.formattingTokens)
    })

    for (const entry of entries) {
      const startMs = this.srtTimeToMs(String(entry.startTime))
      const endMs = this.srtTimeToMs(String(entry.endTime))
      const translatedSource = this.stabilizeFormattingPlaceholders(
        entry.translatedText ?? entry.text ?? '',
        String(entry.text || ''),
        entry.formattingTokens
      )
      if (outputMode === 'bilingual') {
        const translated = translatedSource
        const original = String(entry.text || '')
        if (bilingualLayout === 'original_first') {
          dialogue.push(makeDialogue(entry, 'SubX-Original', original, startMs, endMs))
          dialogue.push(makeDialogue(entry, 'SubX-Translated', translated, startMs, endMs))
        } else {
          dialogue.push(makeDialogue(entry, 'SubX-Translated', translated, startMs, endMs))
          dialogue.push(makeDialogue(entry, 'SubX-Original', original, startMs, endMs))
        }
      } else if (outputMode === 'original') {
        dialogue.push(makeDialogue(entry, 'SubX-Original', String(entry.text || ''), startMs, endMs))
      } else {
        dialogue.push(makeDialogue(entry, 'SubX-Translated', translatedSource, startMs, endMs))
      }
    }

    const assDoc = {
      info: {
        Title: 'SubX Export',
        ScriptType: 'V4.00+',
        PlayResX: '1920',
        PlayResY: '1080',
        WrapStyle: '2',
        ScaledBorderAndShadow: 'yes',
        Collisions: 'Normal'
      },
      styles: {
        format: ['Name', 'Fontname', 'Fontsize', 'PrimaryColour', 'SecondaryColour', 'OutlineColour', 'BackColour', 'Bold', 'Italic', 'Underline', 'StrikeOut', 'ScaleX', 'ScaleY', 'Spacing', 'Angle', 'BorderStyle', 'Outline', 'Shadow', 'Alignment', 'MarginL', 'MarginR', 'MarginV', 'Encoding'],
        style: styles
      },
      events: {
        format: ['Layer', 'Start', 'End', 'Style', 'Name', 'MarginL', 'MarginR', 'MarginV', 'Effect', 'Text'],
        comment: [],
        dialogue
      }
    }

    return stringifyAss(assDoc as any)
  },

  buildAssContent(entries: SubtitleEntry[], subtitleStylePreset: string, outputMode: OutputMode, bilingualLayout: BilingualLayout): string {
    const normalizedEntries = this.normalizeEntries(entries, outputMode, bilingualLayout)
    const assDoc = {
      info: {
        Title: 'SubX Export',
        ScriptType: 'V4.00+',
        PlayResX: '1920',
        PlayResY: '1080',
        WrapStyle: '2',
        ScaledBorderAndShadow: 'yes',
        Collisions: 'Normal'
      },
      styles: {
        format: ['Name', 'Fontname', 'Fontsize', 'PrimaryColour', 'SecondaryColour', 'OutlineColour', 'BackColour', 'Bold', 'Italic', 'Underline', 'StrikeOut', 'ScaleX', 'ScaleY', 'Spacing', 'Angle', 'BorderStyle', 'Outline', 'Shadow', 'Alignment', 'MarginL', 'MarginR', 'MarginV', 'Encoding'],
        style: [this.buildAssStyle(subtitleStylePreset)]
      },
      events: {
        format: ['Layer', 'Start', 'End', 'Style', 'Name', 'MarginL', 'MarginR', 'MarginV', 'Effect', 'Text'],
        comment: [],
        dialogue: normalizedEntries.map(entry => ({
          Layer: 0,
          Start: this.msToAssSeconds(entry.startMs),
          End: this.msToAssSeconds(entry.endMs),
          Style: 'Default',
          Name: '',
          MarginL: 0,
          MarginR: 0,
          MarginV: 0,
          Effect: null,
          Text: outputMode === 'bilingual'
            ? this.buildBilingualAssTextPayload(entries.find(source => String(source.id) === String(entry.id)) || entry as any, bilingualLayout, subtitleStylePreset, entry.prefixTag, entry.formattingTokens)
            : this.buildAssTextPayload(entry.text, entry.prefixTag, entry.formattingTokens)
        }))
      }
    }

    return stringifyAss(assDoc as any)
  },

  rewriteExistingAss(originalContent: string, entries: SubtitleEntry[], outputMode: OutputMode, bilingualLayout: BilingualLayout, subtitleStylePreset = 'bilingual_simple'): string {
    const parsed = parseAss(originalContent)
    const normalizedEntries = this.normalizeEntries(entries, outputMode, bilingualLayout)
    const byId = new Map(normalizedEntries.map(entry => [entry.id, entry]))
    const originalById = new Map(entries.map(entry => [String(entry.id), entry]))

    parsed.events.dialogue = parsed.events.dialogue.map((dialogue, index) => {
      const nextEntry = byId.get(String(index + 1))
      if (!nextEntry) return dialogue

      const originalRaw = typeof (dialogue as any).Text === 'string'
        ? (dialogue as any).Text
        : ((dialogue as any).Text?.raw || '')
      const originalPrefixTag = this.extractLeadingCueTag(originalRaw).prefixTag
      const sourceEntry = originalById.get(String(index + 1))

      return {
        ...dialogue,
        Text: outputMode === 'bilingual'
          ? this.buildBilingualAssTextPayload(
              {
                ...(sourceEntry || nextEntry),
                prefixTag: nextEntry.prefixTag || sourceEntry?.prefixTag || originalPrefixTag
              } as any,
              bilingualLayout,
              subtitleStylePreset,
              nextEntry.prefixTag || sourceEntry?.prefixTag || originalPrefixTag,
              sourceEntry?.formattingTokens || nextEntry.formattingTokens
            )
          : this.buildAssTextPayload(nextEntry.text, nextEntry.prefixTag || originalPrefixTag, nextEntry.formattingTokens)
      }
    })

    return stringifyAss(parsed as any)
  },

  async writeSubtitle(
    entries: SubtitleEntry[],
    outputPath: string,
    outputMode: OutputMode = 'translated',
    subtitleFormat: SubtitleFormat = 'srt',
    subtitleStylePreset = 'bilingual_simple',
    bilingualLayout: BilingualLayout = 'translated_first',
    sourceSubtitlePath?: string,
    subtitleStyle?: SubtitleOutputStyle
  ) {
    const outputDir = join(outputPath, '..')
    if (!existsSync(outputDir)) {
      mkdirSync(outputDir, { recursive: true })
    }

    const normalizedEntries = this.normalizeEntries(entries, outputMode, bilingualLayout)
    const srtEntries = normalizedEntries.map(entry => ({
      id: entry.id,
      startTime: this.msToSrtTime(entry.startMs),
      endTime: this.msToSrtTime(entry.endMs),
      text: this.buildSrtText(entry.text, entry.prefixTag, entry.formattingTokens)
    }))

    const basePath = outputPath.replace(/\.[^.]+$/, '')
    const srtContent = srtParser.toSrt(srtEntries as any).replace(formattingPlaceholderPattern, '')

    if (subtitleFormat === 'srt') {
      const srtPath = `${basePath}.srt`
      atomicWriteFile(srtPath, srtContent)
      console.log(`[Subtitle] 输出 SRT: ${srtPath} (${srtEntries.length} 条)`)
      return srtPath
    }

    const sourceExt = sourceSubtitlePath?.split('.').pop()?.toLowerCase()
    const hasOriginalAss = !!sourceSubtitlePath && (sourceExt === 'ass' || sourceExt === 'ssa') && existsSync(sourceSubtitlePath)
    const useStructuredStyle = !!subtitleStyle && subtitleStyle.presetId !== 'inherit'
    const assContent = useStructuredStyle
      ? this.buildStyledAssContent(entries, outputMode, bilingualLayout, subtitleStyle!)
      : hasOriginalAss
        ? this.rewriteExistingAss(readSubtitleFile(sourceSubtitlePath!), entries, outputMode, bilingualLayout, subtitleStylePreset)
        : this.buildAssContent(entries, subtitleStylePreset, outputMode, bilingualLayout)

    const assPath = `${basePath}.ass`

    if (subtitleFormat === 'ass') {
      atomicWriteFile(assPath, assContent.replace(formattingPlaceholderPattern, ''))
      console.log(`[Subtitle] 输出 ASS: ${assPath} (${srtEntries.length} 条)`)
      return assPath
    }

    const srtPath = `${basePath}.srt`
    atomicWriteFile(srtPath, srtContent)
    atomicWriteFile(assPath, assContent.replace(formattingPlaceholderPattern, ''))
    console.log(`[Subtitle] 输出 SRT+ASS: ${srtPath} + ${assPath} (${srtEntries.length} 条)`)
    return assPath
  },

  chunkByTokens(entries: SubtitleEntry[], maxTokens: number = 2000): SubtitleEntry[][] {
    const chunks: SubtitleEntry[][] = []
    let currentChunk: SubtitleEntry[] = []
    let currentTokens = 0

    for (const entry of entries) {
      const text = entry.text || ''
      const lineCount = text.split('\n').filter(Boolean).length
      const placeholderCount = (text.match(/__SUBX_FMT_\d+__/g) || []).length
      const cjkCount = (text.match(/[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]/g) || []).length
      const latinCount = (text.match(/[a-zA-Z0-9]/g) || []).length
      const otherCount = Math.max(0, Array.from(text).length - cjkCount - latinCount)
      const estimatedTokens = Math.ceil(cjkCount * 1.2 + latinCount / 3.5 + otherCount / 10) + Math.ceil(lineCount * 1.5) + placeholderCount * 2

      if (currentTokens + estimatedTokens > maxTokens && currentChunk.length > 0) {
        chunks.push(currentChunk)
        currentChunk = []
        currentTokens = 0
      }

      currentChunk.push(entry)
      currentTokens += estimatedTokens
    }

    if (currentChunk.length > 0) {
      chunks.push(currentChunk)
    }

    return chunks
  },

  computeCacheHash(
    text: string,
    model: string,
    targetLanguage: string,
    options: { glossary?: Record<string, string>, stylePrompt?: string, promptVersion?: string | number, outputMode?: string, context?: string } = {}
  ): string {
    const glossary = options.glossary || {}
    const glossaryKey = Object.keys(glossary).sort().map(key => `${key}:${glossary[key]}`).join('|')
    const configKey = JSON.stringify({
      glossary: glossaryKey,
      stylePrompt: options.stylePrompt || '',
      promptVersion: options.promptVersion || '',
      outputMode: options.outputMode || '',
      context: options.context || ''
    })
    return createHash('sha256').update(`${model}:${targetLanguage}:${configKey}:${text}`).digest('hex')
  },

  getCachedTranslation(hash: string): string | null {
    const db = useDb()
    const row = db.prepare('SELECT translated_text FROM translations_cache WHERE hash = ?').get(hash) as any
    return row?.translated_text || null
  },

  setCachedTranslation(hash: string, originalText: string, translatedText: string, model: string, targetLanguage: string) {
    const db = useDb()
    db.prepare(`
      INSERT OR REPLACE INTO translations_cache (hash, original_text, translated_text, model, target_language, updated_at)
      VALUES (?, ?, ?, ?, ?, datetime('now'))
    `).run(hash, originalText, translatedText, model, targetLanguage)
  }
}
