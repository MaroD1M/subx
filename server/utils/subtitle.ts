import SrtParser from 'srt-parser-2'
import { parse as parseAss, stringify as stringifyAss } from 'ass-compiler'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { createHash } from 'crypto'
import { join } from 'path'
import type { SubtitleEntry } from '../../types'
import { useDb } from './db'
import { resolveMediaPath } from './mediaRoots'

const srtParser = new SrtParser()

type OutputMode = 'translated' | 'bilingual' | 'original'
type SubtitleFormat = 'srt' | 'ass' | 'both'
type BilingualLayout = 'translated_first' | 'original_first'

export async function safePath(userPath: string, rootId?: string | null): Promise<string> {
  return resolveMediaPath(userPath, rootId)
}

export const SubtitleService = {
  isNonVerbal(text: string): boolean {
    const trimmed = text.trim()
    if (!trimmed) return true
    if (/^[\*\-\.，。！？、…\s]+$/.test(trimmed)) return true
    return false
  },

  async parseSubtitle(filePath: string): Promise<SubtitleEntry[]> {
    const content = readFileSync(filePath, 'utf-8')
    const extension = filePath.split('.').pop()?.toLowerCase()

    if (extension === 'ass' || extension === 'ssa') {
      const parsed = parseAss(content)
      return parsed.events.dialogue.map((event, index) => {
        const rawText = typeof event.Text === 'string'
          ? event.Text
          : (event.Text as any).combined || JSON.stringify(event.Text)

        return {
          id: (index + 1).toString(),
          startTime: this.assSecondsToSrtTime(event.Start),
          endTime: this.assSecondsToSrtTime(event.End),
          text: rawText
            .replace(/\\[nN]/g, '\n')
            .replace(/\{[^}]+\}/g, '')
            .trim()
        }
      })
    }

    const srtEntries = srtParser.fromSrt(content)
    return srtEntries.map(entry => ({
      id: entry.id,
      startTime: entry.startTime,
      endTime: entry.endTime,
      text: entry.text
    }))
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
    const translatedText = String(entry.translatedText ?? entry.text ?? '')

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

  normalizeEntries(entries: SubtitleEntry[], outputMode: OutputMode, bilingualLayout: BilingualLayout) {
    return entries.map(entry => ({
      id: String(entry.id),
      startMs: this.srtTimeToMs(String(entry.startTime)),
      endMs: this.srtTimeToMs(String(entry.endTime)),
      text: this.getDisplayText(entry, outputMode, bilingualLayout)
    }))
  },

  escapeAssText(text: string): string {
    return String(text ?? '')
      .replace(/\\/g, '\\\\')
      .replace(/\{/g, '\\{')
      .replace(/\}/g, '\\}')
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .replace(/\n/g, '\\N')
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
          Text: {
            raw: this.escapeAssText(entry.text),
            combined: String(entry.text ?? ''),
            parsed: [{ tags: [], text: this.escapeAssText(entry.text), drawing: [] }]
          }
        }))
      }
    }

    return stringifyAss(assDoc as any)
  },

  rewriteExistingAss(originalContent: string, entries: SubtitleEntry[], outputMode: OutputMode, bilingualLayout: BilingualLayout): string {
    const parsed = parseAss(originalContent)
    const normalizedEntries = this.normalizeEntries(entries, outputMode, bilingualLayout)
    const byId = new Map(normalizedEntries.map(entry => [entry.id, entry]))

    parsed.events.dialogue = parsed.events.dialogue.map((dialogue, index) => {
      const nextEntry = byId.get(String(index + 1))
      if (!nextEntry) return dialogue

      return {
        ...dialogue,
        Text: {
          raw: this.escapeAssText(nextEntry.text),
          combined: String(nextEntry.text ?? ''),
          parsed: [{ tags: [], text: this.escapeAssText(nextEntry.text), drawing: [] }]
        }
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
    sourceSubtitlePath?: string
  ) {
    const outputDir = join(outputPath, '..')
    if (!existsSync(outputDir)) {
      mkdirSync(outputDir, { recursive: true })
    }

    const normalizedEntries = entries.map(entry => ({
      id: entry.id,
      startTime: entry.startTime,
      endTime: entry.endTime,
      text: this.getDisplayText(entry, outputMode, bilingualLayout)
    }))

    const basePath = outputPath.replace(/\.[^.]+$/, '')
    const srtContent = srtParser.toSrt(normalizedEntries as any)

    if (subtitleFormat === 'srt') {
      const srtPath = `${basePath}.srt`
      writeFileSync(srtPath, srtContent, 'utf-8')
      return srtPath
    }

    const sourceExt = sourceSubtitlePath?.split('.').pop()?.toLowerCase()
    const hasOriginalAss = !!sourceSubtitlePath && (sourceExt === 'ass' || sourceExt === 'ssa') && existsSync(sourceSubtitlePath)
    const assContent = hasOriginalAss
      ? this.rewriteExistingAss(readFileSync(sourceSubtitlePath, 'utf-8'), entries, outputMode, bilingualLayout)
      : this.buildAssContent(entries, subtitleStylePreset, outputMode, bilingualLayout)

    const assPath = `${basePath}.ass`

    if (subtitleFormat === 'ass') {
      writeFileSync(assPath, assContent, 'utf-8')
      return assPath
    }

    const srtPath = `${basePath}.srt`
    writeFileSync(srtPath, srtContent, 'utf-8')
    writeFileSync(assPath, assContent, 'utf-8')
    return assPath
  },

  chunkByTokens(entries: SubtitleEntry[], maxTokens: number = 2000): SubtitleEntry[][] {
    const chunks: SubtitleEntry[][] = []
    let currentChunk: SubtitleEntry[] = []
    let currentTokens = 0

    for (const entry of entries) {
      const text = entry.text || ''
      const estimatedTokens = Math.ceil(text.length / 3.5)

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

  computeCacheHash(text: string, model: string, targetLanguage: string): string {
    return createHash('sha256').update(`${model}:${targetLanguage}:${text}`).digest('hex')
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
