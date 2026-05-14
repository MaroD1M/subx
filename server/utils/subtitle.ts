import SrtParser from 'srt-parser-2'
import { parse as parseAss, compile as compileAss } from 'ass-compiler'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { createHash } from 'crypto'
import { join, resolve, normalize } from 'path'
import type { SubtitleEntry } from '../../types'
import { useDb } from './db'

const srtParser = new SrtParser()

export function safePath(userPath: string): string {
    const videoDir = normalize(resolve(process.env.VIDEO_DIR || '/data'))
    const resolved = normalize(resolve(videoDir, userPath))
    if (!resolved.startsWith(videoDir + '/') && !resolved.startsWith(videoDir + '\\') && resolved !== videoDir) {
        throw createError({ statusCode: 403, message: '路径越权' })
    }
    return resolved
}

export const SubtitleService = {
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

    async writeSubtitle(entries: SubtitleEntry[], outputPath: string, outputMode: 'translated' | 'bilingual' = 'translated') {
        const outputDir = join(outputPath, '..')
        if (!existsSync(outputDir)) {
            mkdirSync(outputDir, { recursive: true })
        }

        const srtEntries = entries.map(entry => {
            const translatedText = entry.translatedText || entry.text
            let displayText: string

            if (outputMode === 'bilingual' && entry.translatedText) {
                displayText = `${entry.text}\n${entry.translatedText}`
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

        const srtContent = srtParser.toSrt(srtEntries as any)
        writeFileSync(outputPath, srtContent, 'utf-8')
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
