import SrtParser from 'srt-parser-2'
import { parse as parseAss, compile as compileAss } from 'ass-compiler'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { createHash } from 'crypto'
import { join } from 'path'
import type { SubtitleEntry } from '../../types'
import { useDb } from './db'
import { resolveMediaPath } from './mediaRoots'

const srtParser = new SrtParser()

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
                    startTime: this.assTimeToSrtTime(event.Start),
                    endTime: this.assTimeToSrtTime(event.End),
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

    assTimeToSrtTime(assTime: number): string {
        const totalSeconds = assTime
        const hrs = Math.floor(totalSeconds / 3600)
        const mins = Math.floor((totalSeconds % 3600) / 60)
        const secs = Math.floor(totalSeconds % 60)
        const ms = Math.floor((totalSeconds % 1) * 1000)

        return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')},${ms.toString().padStart(3, '0')}`
    },

    async writeSubtitle(
        entries: SubtitleEntry[],
        outputPath: string,
        outputMode: 'translated' | 'bilingual' | 'original' = 'translated',
        subtitleFormat: 'srt' | 'ass' | 'both' = 'srt',
        subtitleStylePreset = 'bilingual_simple',
        bilingualLayout: 'translated_first' | 'original_first' = 'translated_first'
    ) {
        const outputDir = join(outputPath, '..')
        if (!existsSync(outputDir)) {
            mkdirSync(outputDir, { recursive: true })
        }

        const normalizedEntries = entries.map(entry => {
            const translatedText = entry.translatedText || entry.text
            let displayText: string

            if (outputMode === 'original') {
                displayText = entry.text
            } else if (outputMode === 'bilingual' && entry.translatedText) {
                displayText = bilingualLayout === 'original_first'
                    ? `${entry.text}\n${entry.translatedText}`
                    : `${entry.translatedText}\n${entry.text}`
            } else {
                displayText = translatedText
            }

            return {
                id: entry.id,
                startTime: entry.startTime,
                endTime: entry.endTime,
                text: displayText
            }
        })

        const basePath = outputPath.replace(/\.[^.]+$/, '')
        const srtContent = srtParser.toSrt(normalizedEntries as any)

        if (subtitleFormat === 'srt') {
            const srtPath = `${basePath}.srt`
            writeFileSync(srtPath, srtContent, 'utf-8')
            return srtPath
        }

        const assDialogue = normalizedEntries.map(entry => ({
            Layer: 0,
            Start: entry.startTime.replace(',', '.'),
            End: entry.endTime.replace(',', '.'),
            Style: 'Default',
            Name: '',
            MarginL: '0',
            MarginR: '0',
            MarginV: '0',
            Effect: '',
            Text: entry.text.replace(/\n/g, '\\N')
        }))

        const assDoc = {
            info: {
                Title: 'SubX Export',
                ScriptType: 'v4.00+'
            },
            styles: {
                format: ['Name', 'Fontname', 'Fontsize', 'PrimaryColour', 'SecondaryColour', 'OutlineColour', 'BackColour', 'Bold', 'Italic', 'Underline', 'StrikeOut', 'ScaleX', 'ScaleY', 'Spacing', 'Angle', 'BorderStyle', 'Outline', 'Shadow', 'Alignment', 'MarginL', 'MarginR', 'MarginV', 'Encoding'],
                style: [{
                    Name: 'Default',
                    Fontname: 'Arial',
                    Fontsize: subtitleStylePreset.includes('cinema') ? '56' : '48',
                    PrimaryColour: '&H00FFFFFF',
                    SecondaryColour: '&H000000FF',
                    OutlineColour: '&H00000000',
                    BackColour: '&H64000000',
                    Bold: subtitleStylePreset.includes('bold') ? '-1' : '0',
                    Italic: '0',
                    Underline: '0',
                    StrikeOut: '0',
                    ScaleX: '100',
                    ScaleY: '100',
                    Spacing: '0',
                    Angle: '0',
                    BorderStyle: '1',
                    Outline: subtitleStylePreset.includes('cinema') ? '2.5' : '2',
                    Shadow: '0.5',
                    Alignment: '2',
                    MarginL: '30',
                    MarginR: '30',
                    MarginV: subtitleStylePreset.includes('cinema') ? '40' : '20',
                    Encoding: '1'
                }]
            },
            events: {
                format: ['Layer', 'Start', 'End', 'Style', 'Name', 'MarginL', 'MarginR', 'MarginV', 'Effect', 'Text'],
                dialogue: assDialogue
            }
        }

        const assContent = compileAss(assDoc as any)
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

        const estimateTokens = (text: string) => {
            const words = text.split(/\s+/).length
            const nonAscii = (text.match(/[^\x00-\x7F]/g) || []).length
            return words + nonAscii * 1.5
        }

        for (const entry of entries) {
            const entryTokens = estimateTokens(entry.text)
            if (currentTokens + entryTokens > maxTokens && currentChunk.length > 0) {
                chunks.push(currentChunk)
                currentChunk = []
                currentTokens = 0
            }
            currentChunk.push(entry)
            currentTokens += entryTokens
        }

        if (currentChunk.length > 0) chunks.push(currentChunk)

        return chunks
    },

    computeCacheHash(sourceText: string, model: string, targetLang: string): string {
        return createHash('sha256').update(`${sourceText}|${model}|${targetLang}`).digest('hex')
    },

    getCachedTranslation(hash: string): string | null {
        const db = useDb()
        const row = db.prepare('SELECT translated FROM translation_cache WHERE hash = ?').get(hash) as any
        return row ? row.translated : null
    },

    setCachedTranslation(hash: string, sourceText: string, translated: string, model: string, targetLang: string): void {
        const db = useDb()
        db.prepare(
            'INSERT OR REPLACE INTO translation_cache (hash, source_text, translated, model, target_lang, created_at) VALUES (?, ?, ?, ?, ?, datetime(\'now\'))'
        ).run(hash, sourceText, translated, model, targetLang)
    }
}
