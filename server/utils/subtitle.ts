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
    renderText(
        entry: SubtitleEntry,
        outputMode: 'translated' | 'bilingual',
        stylePreset: 'inherit' | 'bilingual_simple' | 'bilingual_cinema' | 'bilingual_study' | 'mono_clean' | 'mono_compact',
        layout: 'translated_first' | 'original_first'
    ): string {
        const translated = (entry.translatedText || entry.text || '').trim()
        const original = (entry.text || '').trim()

        if (outputMode === 'translated' || stylePreset === 'mono_clean' || stylePreset === 'mono_compact') {
            return translated
        }

        const top = layout === 'translated_first' ? translated : original
        const bottomRaw = layout === 'translated_first' ? original : translated
        const bottom = stylePreset === 'bilingual_simple'
            ? `- ${bottomRaw}`
            : stylePreset === 'bilingual_study'
                ? `[${bottomRaw}]`
                : bottomRaw

        return `${top}\n${bottom}`
    },

    writeAssSubtitle(
        entries: SubtitleEntry[],
        outputPath: string,
        outputMode: 'translated' | 'bilingual' = 'translated',
        stylePreset: 'inherit' | 'bilingual_simple' | 'bilingual_cinema' | 'bilingual_study' | 'mono_clean' | 'mono_compact' = 'bilingual_simple',
        layout: 'translated_first' | 'original_first' = 'translated_first'
    ) {
        const outputDir = join(outputPath, '..')
        if (!existsSync(outputDir)) {
            mkdirSync(outputDir, { recursive: true })
        }

        const mainFontSize = stylePreset === 'bilingual_cinema' ? 56 : 46
        const lineSpacing = stylePreset === 'bilingual_study' ? 10 : 4
        const ass = `[Script Info]
Title: SubX Generated Subtitle
ScriptType: v4.00+
WrapStyle: 0
PlayResX: 1920
PlayResY: 1080
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Noto Sans CJK SC,${mainFontSize},&H00FFFFFF,&H000000FF,&H00101010,&H64000000,0,0,0,0,100,100,0,0,1,2,1,2,40,40,35,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text`

        const dialogues = entries.map(entry => {
            const start = entry.startTime.replace(',', '.')
            const end = entry.endTime.replace(',', '.')
            const text = this.renderText(entry, outputMode, stylePreset, layout)
                .replace(/\n/g, '\\N')
                .replace(/\{/g, '（')
                .replace(/\}/g, '）')
            return `Dialogue: 0,${start},${end},Default,,0,0,0,,${text}`
        }).join('\n')

        writeFileSync(outputPath, `${ass}\n${dialogues}\n`, 'utf-8')
    },

    isNonVerbal(text: string): boolean {
        const trimmed = text.trim()
        if (!trimmed) return true
        // 仅包含星号、破折号或纯标点符号的情况视为非语言
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
        outputMode: 'translated' | 'bilingual' = 'translated',
        stylePreset: 'inherit' | 'bilingual_simple' | 'bilingual_cinema' | 'bilingual_study' | 'mono_clean' | 'mono_compact' = 'bilingual_simple',
        layout: 'translated_first' | 'original_first' = 'translated_first'
    ) {
        const outputDir = join(outputPath, '..')
        if (!existsSync(outputDir)) {
            mkdirSync(outputDir, { recursive: true })
        }

        const srtEntries = entries.map(entry => {
            const displayText = this.renderText(entry, outputMode, stylePreset, layout)

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
