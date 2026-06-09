import OpenAI from 'openai'
import type { SubtitleEntry } from '../../types'
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions'
import { useDb } from './db'
import { SubtitleService } from './subtitle'
import { appendFileSync, existsSync, readFileSync, rmSync, mkdirSync } from 'fs'
import { join } from 'path'

const STREAM_REQUEST_TIMEOUT_MS = 5 * 60 * 1000
const STREAM_IDLE_TIMEOUT_MS = 45 * 1000
const RAW_RESPONSE_MAX_CHARS = 12000

interface StreamCallbacks {
    onEntryTranslated?: (entry: { id: string; translatedText: string }) => void
}

function buildTranslationPrompt(
    chunk: SubtitleEntry[],
    targetLanguage: string,
    glossaryText: string,
    contextText: string,
    styleBlock: string
): string {
    const inputLines = chunk.map(e => `${e.id}\n${e.text}`).join('\n\n')

    return `你是专业影视字幕翻译。将以下字幕逐条翻译为地道的${targetLanguage}。
${styleBlock}
输出格式（严格遵守！）：
- 默认使用纯文本逐条输出：每条翻译占两行，第一行是序号，第二行是翻译文本，条目之间用一个空行分隔
- 例如：1
你好

2
世界
- 如果你非常确定可以稳定输出结构化结果，才允许返回 JSON：{"items":[{"id":"1","translatedText":"..."},{"id":"2","translatedText":"..."}]}
- 无论是纯文本还是 JSON，每个 id 必须与输入序号完全一致，且所有条目都必须返回，不能增减任何条目
- 不要输出任何其他内容（不要 markdown、不要解释、不要编号前缀）
- 不要输出任何字幕格式控制标签，例如 {\an8}、\N、<i>、</i>、<font> 等
- 如果原文中出现形如 __SUBX_FMT_1__ 的占位符，必须在译文中原样保留，不可翻译、不可删除、不可改序
- 即使某条原文很短、像歌词、像专有名词、像年份/括号说明，也必须输出对应序号和结果
- 如果目标语言与原文语言接近（如繁体转简体、同语种字形转换），允许个别条目与原文相同，但仍必须逐条输出，不可省略

影视字幕翻译规范（极其重要！）：
1.【单行长度限制】单行字幕尽量简短，中文字符建议不超过 15-18 个。如果原文长句，请根据语义和呼吸停顿点进行换行（可使用真实换行或在译文适当位置插入 \\n）。
2.【标点符号处理】标准字幕不该有句末标点。必须删除行尾的句号（。）和逗号（，）。句子内部的停顿使用半角或全角空格，或者直接换行，不要出现逗号。可保留问号（？）、叹号（！）和省略号（...）。
3.【语气词冗余】必须在翻译时删除无意义的口语填充词，如"嗯"、"啊"、"呃"、"这个"、"那个"、"我的意思是"等，以使字幕画面保持干净利落。
4.【歌词特殊处理】如果原文或上下文明显是歌词（比如包含♪符号或强韵律的句子），请在翻译两端固定加上（♪）或保留原有音符。歌词翻译不求字面精准，追求意境和押韵。
5.【贴合语境】翻译风格自然流畅，符合人物所处场景及该类影视剧表达习惯。
6.【环境音翻译】如果原文包含在中括号 [] 或圆括号 () 内的环境音描述或旁白（如 [insects chirping]、[sighs]），请将其汉化（如 [虫鸣声]、[叹气]），并保留原有的括号格式。

术语表：
${glossaryText}

前文背景：
${contextText}

待翻译：
${inputLines}`
}

function normalizeAiOutput(raw: string): string {
    return String(raw || '')
        .replace(/\r\n/g, '\n')
        .replace(/\r/g, '\n')
        .replace(/^\s*```[^\n]*$/gm, '')
        .replace(/^\s*[-*]\s+/gm, '')
        .trim()
}

function extractIdFromLine(line: string): string | null {
    const normalized = line.trim().replace(/^[（(【\[]?(?:id|ID)[:：#\s]*/, '').replace(/[）)】\]]$/, '')
    const match = normalized.match(/^(\d+)(?:[.:：)、\]\s-].*)?$/)
    return match?.[1] || null
}

function detectOutputAnomaly(fullContent: string): 'empty' | 'refusal' | 'filtered' | 'other' {
    const normalized = normalizeAiOutput(fullContent).toLowerCase()
    if (!normalized) return 'empty'
    if (/无法|不能|抱歉|对不起|sorry|cannot|can\'t|unable|i can\'t|i cannot|policy|safety/.test(normalized)) return 'refusal'
    if (/\[content filtered\]|\[filtered\]|content omitted|内容已过滤|已过滤/.test(normalized)) return 'filtered'
    return 'other'
}

function extractJsonCandidate(fullContent: string): string | null {
    const normalized = String(fullContent || '').trim()
    if (!normalized) return null

    const fencedMatch = normalized.match(/```(?:json)?\s*([\s\S]*?)```/i)
    if (fencedMatch?.[1]) {
        return fencedMatch[1].trim()
    }

    if (normalized.startsWith('[') && normalized.endsWith(']')) {
        return normalized
    }

    if (normalized.startsWith('{') && normalized.endsWith('}')) {
        return normalized
    }

    const firstBrace = normalized.indexOf('{')
    const lastBrace = normalized.lastIndexOf('}')
    const firstBracket = normalized.indexOf('[')
    const lastBracket = normalized.lastIndexOf(']')
    if (firstBracket !== -1 && lastBracket > firstBracket) {
        return normalized.slice(firstBracket, lastBracket + 1)
    }

    if (firstBrace !== -1 && lastBrace > firstBrace) {
        return normalized.slice(firstBrace, lastBrace + 1)
    }

    return null
}

function parseJsonTranslations(fullContent: string, expectedIds: string[] = []): Map<string, string> {
    const result = new Map<string, string>()
    const expectedSet = new Set(expectedIds)
    const candidate = extractJsonCandidate(fullContent)
    if (!candidate) return result

    try {
        const parsed = JSON.parse(candidate)
        const items = Array.isArray(parsed)
            ? parsed
            : (Array.isArray(parsed?.items) ? parsed.items : [])

        for (const item of items) {
            const id = String(item?.id ?? '').trim()
            const translatedText = String(item?.translatedText ?? item?.text ?? '').trim()
            if (!id || (!expectedSet.size ? false : !expectedSet.has(id))) continue
            result.set(id, translatedText)
        }
    } catch {
        return new Map<string, string>()
    }

    return result
}



function parseTextTranslations(fullContent: string, expectedIds: string[] = []): Map<string, string> {
    const result = new Map<string, string>()
    const normalized = normalizeAiOutput(fullContent)
    const expectedSet = new Set(expectedIds)
    const lines = normalized.split('\n')

    let currentId = ''
    let buffer: string[] = []

    const flush = () => {
        if (!currentId) return
        result.set(currentId, buffer.join('\n').trim())
        currentId = ''
        buffer = []
    }

    for (const rawLine of lines) {
        const line = rawLine.trimEnd()
        const maybeId = extractIdFromLine(line)
        if (maybeId && (!expectedSet.size || expectedSet.has(maybeId))) {
            flush()
            currentId = maybeId
            const remainder = line.replace(/^(\d+)(?:[.:：)、\]\s-]+)?/, '').trim()
            if (remainder) buffer.push(remainder)
            continue
        }

        if (!currentId) continue
        if (/^\s*[\[{]\s*"?items"?\s*:/i.test(line) || /^\s*\{\s*"items"\s*:/i.test(line) || /^\s*\[$/.test(line)) {
            flush()
            continue
        }
        if (!line.trim() && buffer.length === 0) continue
        buffer.push(rawLine)
    }
    flush()

    if (result.size > 0) return result

    const blocks = normalized.split(/\n\s*\n+/)
    for (const block of blocks) {
        const trimmed = block.trim()
        if (!trimmed) continue
        const singleLineMatch = trimmed.match(/^(\d+)[.:：\s]+(.+)$/)
        if (singleLineMatch && singleLineMatch[1] && singleLineMatch[2]) {
            if (!expectedSet.size || expectedSet.has(singleLineMatch[1])) {
                result.set(singleLineMatch[1], singleLineMatch[2].trim())
            }
        }
    }

    return result
}

function summarizeResponseMeta(fullContent: string, expectedIds: string[]) {
    const anomaly = detectOutputAnomaly(fullContent)
    const textParsed = parseTextTranslations(fullContent, expectedIds)
    const jsonParsed = parseJsonTranslations(fullContent, expectedIds)
    const parsed = textParsed.size > 0 ? textParsed : jsonParsed
    const format = textParsed.size > 0 ? 'text' : (jsonParsed.size > 0 ? 'json' : 'unknown')
    const missingIds = expectedIds.filter(id => !parsed.has(id))
    return {
        format,
        anomaly,
        parsedCount: parsed.size,
        expectedCount: expectedIds.length,
        missingIds: missingIds.slice(0, 20)
    }
}

export function parseAiTranslations(fullContent: string, expectedIds: string[] = []): Map<string, string> {
    const textParsed = parseTextTranslations(fullContent, expectedIds)
    if (textParsed.size > 0) return textParsed

    const jsonParsed = parseJsonTranslations(fullContent, expectedIds)
    if (jsonParsed.size > 0) return jsonParsed

    return new Map<string, string>()
}


export const TranslationService = {
    async translateChunk(
        openai: OpenAI,
        chunk: SubtitleEntry[],
        targetLanguage: string = 'zh-CN',
        glossary: Record<string, string> = {},
        previousContext: SubtitleEntry[] = [],
        model: string = 'gpt-4o-mini',
        taskId?: string,
        chunkIndex?: number,
        stylePrompt?: string,
        callbacks?: StreamCallbacks,
        streamUsage: boolean = false,
        attempt: number = 0,
        useStreaming: boolean = false
    ): Promise<SubtitleEntry[]> {
        const glossaryText = Object.entries(glossary)
            .map(([key, value]) => `${key} -> ${value}`)
            .join('\n')

        const contextText = previousContext
            .slice(-5)
            .map(entry => `ID:${entry.id} Context: ${entry.translatedText || entry.text}`)
            .join('\n')

        const styleBlock = stylePrompt
            ? `\n翻译风格指令（最高优先级！）：\n${stylePrompt}\n`
            : ''

        const prompt = buildTranslationPrompt(chunk, targetLanguage, glossaryText, contextText, styleBlock)

        const partialPath = taskId
            ? join(process.cwd(), 'temp', `${taskId}.chunk-${chunkIndex ?? 0}.partial`)
            : null

        if (partialPath) {
            const partialDir = join(partialPath, '..')
            if (!existsSync(partialDir)) {
                mkdirSync(partialDir, { recursive: true })
            }
        }

        const logDir = join(process.cwd(), 'temp', 'ai-logs')
        if (!existsSync(logDir)) mkdirSync(logDir, { recursive: true })

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
        const logFile = join(logDir, `task_${taskId || 'unknown'}_chunk_${chunkIndex ?? 0}_attempt_${attempt}_${timestamp}.log`)

        let fullContent = ''
        let lastParsedIndex = 0

        try {
            const systemMessage = `你是高级字幕翻译专家。按指定格式逐条输出翻译，不要输出任何额外内容。不要输出任何字幕控制标签（例如 {\an8}、\N、HTML 标签）。如果输入里出现 __SUBX_FMT_1__ 这类占位符，必须原样保留。每条输入都必须有对应的翻译输出，序号必须与输入完全一致。若目标是中文变体转换或原文本身无需变化，也必须保留该条并按序号输出，不可省略。${stylePrompt ? ' ' + stylePrompt : ''}`
            const messages: ChatCompletionMessageParam[] = [
                { role: 'system', content: systemMessage },
                { role: 'user', content: prompt }
            ]

            // 写入初始日志
            const requestOptions = {
                model: model,
                stream: useStreaming,
                stream_options: useStreaming && streamUsage ? { include_usage: true } : undefined,
                timeout: STREAM_REQUEST_TIMEOUT_MS
            }

            const initialLog = `=== TASK INFO ===
Task ID: ${taskId}
Chunk Index: ${chunkIndex}
Attempt: ${attempt}
Model: ${model}
Target: ${targetLanguage}
Translation Mode: ${useStreaming ? 'STREAM' : 'NON_STREAM'}
Stream Usage Toggle: ${streamUsage ? 'ON' : 'OFF'}
Timestamp: ${new Date().toISOString()}

=== REQUEST OPTIONS ===
${JSON.stringify(requestOptions, null, 2)}

=== SYSTEM MESSAGE ===
${systemMessage}

=== USER PROMPT ===
${prompt}

=== AI STREAMING RESPONSE ===
`
            appendFileSync(logFile, initialLog)

            const response = await openai.chat.completions.create({
                ...requestOptions,
                messages,
                stream: useStreaming
            }) as any

            let lastLogTime = Date.now()
            let lastChunkTime = Date.now()
            let buffer = ''
            let usage = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 }

            if (!useStreaming) {
                const content = response.choices?.[0]?.message?.content || ''
                fullContent = typeof content === 'string' ? content : ''
                buffer = fullContent
                usage = {
                    prompt_tokens: response.usage?.prompt_tokens ?? 0,
                    completion_tokens: response.usage?.completion_tokens ?? 0,
                    total_tokens: response.usage?.total_tokens ?? 0
                }
                appendFileSync(logFile, fullContent)
            } else for await (const part of response) {
                if (Date.now() - lastChunkTime > STREAM_IDLE_TIMEOUT_MS) {
                    try {
                        response.controller?.abort()
                    } catch { /* ignore */ }
                    throw new Error(`流式响应长时间无数据（>${Math.round(STREAM_IDLE_TIMEOUT_MS / 1000)}s），已中止本次请求`)
                }
                if (part.usage) {
                    usage = {
                        prompt_tokens: part.usage.prompt_tokens ?? 0,
                        completion_tokens: part.usage.completion_tokens ?? 0,
                        total_tokens: part.usage.total_tokens ?? 0
                    }
                }

                const content = part.choices[0]?.delta?.content || ''
                if (content || part.usage) {
                    lastChunkTime = Date.now()
                }
                fullContent += content
                buffer += content

                // 实时写入日志文件
                if (content) {
                    appendFileSync(logFile, content)
                }

                if (Date.now() - lastLogTime > 2000 && fullContent.length > 0) {
                    console.log(`[Stream] Task ${taskId} chunk ${chunkIndex} received ${fullContent.length} bytes...`)
                    lastLogTime = Date.now()
                }

                const newEntries = this.parseNewEntries(buffer, lastParsedIndex, chunk)
                if (newEntries.length > 0) {
                    lastParsedIndex += newEntries.length

                    if (partialPath) {
                        try {
                            for (const entry of newEntries) {
                                appendFileSync(partialPath, `${entry.id}\n${entry.translatedText}\n\n`)
                            }
                        } catch (fsErr) {
                            console.error('[FS] Failed to write partial file:', fsErr)
                        }
                    }

                    if (callbacks?.onEntryTranslated) {
                        for (const entry of newEntries) {
                            callbacks.onEntryTranslated(entry)
                        }
                    }
                }
            }

            // 写入结束日志
            appendFileSync(logFile, `\n\n=== SUMMARY ===
Tokens: ${usage.total_tokens} (P: ${usage.prompt_tokens}, C: ${usage.completion_tokens})
End Time: ${new Date().toISOString()}
`)

            console.log(`[${useStreaming ? 'Stream' : 'NonStream'}] Task ${taskId} chunk ${chunkIndex} complete, total ${fullContent.length} bytes, tokens: ${usage.total_tokens} (prompt: ${usage.prompt_tokens}, completion: ${usage.completion_tokens})`)

            if (taskId) {
                try {
                    const db = useDb()
                    const rawRequest = JSON.stringify({ systemMessage, prompt }).slice(0, RAW_RESPONSE_MAX_CHARS)
                    const rawResponse = String(fullContent || '').slice(0, RAW_RESPONSE_MAX_CHARS)
                    const responseMeta = JSON.stringify(summarizeResponseMeta(fullContent, chunk.map(entry => String(entry.id)))).slice(0, RAW_RESPONSE_MAX_CHARS)
                    db.prepare('INSERT INTO task_responses (task_id, chunk_index, model, raw_request, raw_response, response_meta, prompt_tokens, completion_tokens, total_tokens) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
                        taskId,
                        chunkIndex ?? 0,
                        model,
                        rawRequest,
                        rawResponse,
                        responseMeta,
                        usage.prompt_tokens,
                        usage.completion_tokens,
                        usage.total_tokens
                    )
                } catch (dbErr) {
                    console.error('[DB] Failed to save token stats:', dbErr)
                }
            }
        } catch (e: any) {
            const errorLog = `\n\n=== ERROR ===\n${e.message}\n${e.stack || ''}`
            try {
                appendFileSync(logFile, errorLog)
            } catch { /* ignore */ }

            console.error('\n' + '!'.repeat(20) + ' 流式 API 请求失败 ' + '!'.repeat(20))
            console.error(`[DEBUG] Model: ${model}`)
            console.error(`[DEBUG] Chunk size: ${chunk.length} entries`)
            console.error(`[DEBUG] Error: ${e.message}`)
            if (e.status) console.error(`[DEBUG] HTTP Status: ${e.status}`)
            if (e.error) console.error(`[DEBUG] Error Detail: ${JSON.stringify(e.error)}`)
            console.error('!'.repeat(60) + '\n')
            throw e
        }

        const expectedIds = chunk.map(entry => String(entry.id))
        const translatedMap = parseAiTranslations(fullContent, expectedIds)

        if (translatedMap.size === 0) {
            const anomaly = detectOutputAnomaly(fullContent)
            console.warn(`[Parser] 警告: 解析出的翻译条目为空! 原始内容长度: ${fullContent.length}, 异常类型: ${anomaly}`)
            if (fullContent.length > 0) {
                console.warn(`[Parser] 原始内容前200字符: ${fullContent.substring(0, 200)}`)
            }
            if (anomaly === 'refusal') {
                throw new Error(`[疑似拒答] 模型返回了拒答/安全拦截内容，未产出可解析译文 (Length: ${fullContent.length})`)
            }
            if (anomaly === 'filtered') {
                throw new Error(`[解析为空] 模型返回内容疑似被过滤，未产出可解析译文 (Length: ${fullContent.length})`)
            }
            throw new Error(`[解析为空] AI 返回内容为空或格式错误 (Length: ${fullContent.length})`)
        } else if (translatedMap.size !== chunk.length) {
            const missingIds = expectedIds.filter(id => !translatedMap.has(id))
            const partialResults = chunk
                .filter(entry => translatedMap.has(String(entry.id)))
                .map(entry => ({
                    ...entry,
                    translatedText: translatedMap.get(String(entry.id)) as string
                }))
            const msg = `[条目缺失] 已解析 ${translatedMap.size}/${chunk.length}，缺失 ID: ${missingIds.slice(0, 10).join(', ')}${missingIds.length > 10 ? '...' : ''}`
            console.warn(`[Parser] ${msg}`)
            const error: any = new Error(msg)
            error.code = 'PARTIAL_TRANSLATION'
            error.partialResults = partialResults
            error.missingIds = missingIds
            throw error
        }

        const result = chunk.map((entry) => {
            const translated = translatedMap.get(String(entry.id))
            return {
                ...entry,
                translatedText: translated !== undefined ? translated : entry.text
            }
        })

        const verbalEntries = chunk.filter(e => !SubtitleService.isNonVerbal(e.text))
        const translatedVerbalCount = result.filter(e =>
            !SubtitleService.isNonVerbal(e.text)
            && e.translatedText
            && SubtitleService.normalizeComparisonText(e.translatedText)
            && (SubtitleService.normalizeComparisonText(e.translatedText) !== SubtitleService.normalizeComparisonText(e.text)
              || SubtitleService.isAcceptableSameText(e.text, e.translatedText, targetLanguage))
        ).length

        if (verbalEntries.length > 0 && translatedVerbalCount === 0) {
            const anomaly = detectOutputAnomaly(fullContent)
            if (anomaly === 'refusal') {
                throw new Error(`[疑似拒答] chunk ${chunkIndex} 包含 ${verbalEntries.length} 条语音条目，但模型未给出有效译文`)
            }
            throw new Error(`[无有效译文] chunk ${chunkIndex} 包含 ${verbalEntries.length} 条语音条目，但无有效译文 (AI返回 ${fullContent.length} bytes, 原始内容: "${fullContent.substring(0, 100)}")`)
        }

        return result
    },

    parseNewEntries(buffer: string, startIndex: number, chunk: SubtitleEntry[]): { id: string; translatedText: string }[] {
        const entries: { id: string; translatedText: string }[] = []
        const parsed = parseAiTranslations(buffer, chunk.map(e => String(e.id)))
        const allIds = Array.from(parsed.keys())

        for (let i = startIndex; i < allIds.length; i++) {
            const id = allIds[i]
            const translatedText = parsed.get(id) || ''
            entries.push({ id, translatedText })
        }

        return entries
    },

    loadPartialTranslations(taskId: string, chunkIndex: number): Map<string, string> {
        const partialPath = join(process.cwd(), 'temp', `${taskId}.chunk-${chunkIndex}.partial`)
        if (!existsSync(partialPath)) return new Map()

        try {
            const content = readFileSync(partialPath, 'utf-8')
            return parseAiTranslations(content)
        } catch {
            return new Map()
        }
    },

    cleanupPartialFiles(taskId: string, totalChunks: number) {
        for (let i = 0; i < totalChunks; i++) {
            const partialPath = join(process.cwd(), 'temp', `${taskId}.chunk-${i}.partial`)
            try {
                if (existsSync(partialPath)) {
                    rmSync(partialPath, { force: true })
                }
            } catch { /* ignore */ }
        }
    }
}
