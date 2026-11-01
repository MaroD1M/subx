import { existsSync, readFileSync, rmSync, statSync } from 'fs'
import { basename, dirname, join } from 'path'
import type { SubtitleEntry } from '../../../types'
import { useDb } from '../db'
import { SubtitleService } from '../subtitle'
import { VideoService } from '../video'
import type { AsrOptions, AsrPersistedResult, AsrResult, AsrSegment, AsrWord } from './types'

const REQUEST_TIMEOUT_MS = 60 * 60 * 1000
const CLOUD_TIMEOUT_MS = 30 * 60 * 1000
const CLOUD_MAX_BYTES = 24 * 1024 * 1024

function combineSignal(signal: AbortSignal | undefined, timeout: AbortController): AbortSignal {
  if (!signal) return timeout.signal
  if (typeof AbortSignal.any === 'function') return AbortSignal.any([signal, timeout.signal])
  return signal
}

function normalizeBaseUrl(value: string) {
  return String(value || '').trim().replace(/\/+$/, '')
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function isAsrNetworkError(error: any) {
  if (error?.name === 'AbortError') return false
  const text = `${error?.message || ''} ${error?.cause?.code || ''} ${error?.cause?.message || ''}`.toLowerCase()
  return /fetch failed|econnrefused|econnreset|enotfound|etimedout|network|socket|other side closed/.test(text)
}

function describeAsrError(error: any) {
  const cause = error?.cause
  return String(cause?.code || cause?.message || error?.message || error || '未知错误')
}

function buildAsrForm(fileName: string, audio: Buffer, options: AsrOptions, engine: string) {
  const form = new FormData()
  form.append('file', new Blob([audio as any], { type: 'audio/wav' }), fileName)
  form.append('model', options.model || 'small')
  form.append('language', options.language || 'auto')
  if (options.device) form.append('device', options.device)
  if (options.computeType) form.append('compute_type', options.computeType)
  form.append('vad', String(options.vad !== false))
  form.append('word_timestamps', String(options.wordTimestamps !== false))
  if (engine !== 'auto') form.append('engine', engine)
  if (options.preprocess && options.preprocess !== 'off') form.append('preprocess', options.preprocess)
  if (options.diarize) form.append('diarize', 'true')
  return form
}

async function transcribeLocal(baseUrl: string, fileName: string, audio: Buffer, options: AsrOptions, engine: string, signal?: AbortSignal): Promise<AsrResult> {
  const timeout = new AbortController()
  const timer = setTimeout(() => timeout.abort(), REQUEST_TIMEOUT_MS)
  const headers: Record<string, string> = {}
  if (options.apiKey) headers.Authorization = `Bearer ${options.apiKey}`
  try {
    const response = await fetch(`${baseUrl}/v1/audio/transcriptions`, {
      method: 'POST',
      headers,
      body: buildAsrForm(fileName, audio, options, engine),
      signal: combineSignal(signal, timeout)
    })
    if (!response.ok) {
      const detail = await response.text().catch(() => '')
      throw new Error(`ASR 请求失败 (${response.status}): ${detail.slice(0, 500)}`)
    }
    const data = await response.json() as AsrResult
    if (!Array.isArray(data.segments) || data.segments.length === 0) {
      throw new Error('ASR 未返回可用的带时间轴分段')
    }
    return {
      ...data,
      language: String(data.language || 'unknown'),
      duration: Number(data.duration || 0),
      text: String(data.text || ''),
      segments: data.segments.filter(segment => String(segment.text || '').trim())
    }
  } finally {
    clearTimeout(timer)
  }
}

async function transcribeLocalWithRetry(baseUrl: string, fileName: string, audio: Buffer, options: AsrOptions, engine: string, signal?: AbortSignal): Promise<AsrResult> {
  let lastError: any
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await transcribeLocal(baseUrl, fileName, audio, options, engine, signal)
    } catch (error: any) {
      lastError = error
      if (!isAsrNetworkError(error) || signal?.aborted || attempt === 2) break
      await sleep(600 * (attempt + 1))
    }
  }
  throw lastError
}

function asrCandidates(baseUrl: string) {
  const candidates = [baseUrl]
  const local = normalizeBaseUrl(process.env.ASR_INTERNAL_URL || 'http://127.0.0.1:8000')
  if (local && local !== baseUrl && (process.env.SUBX_ALL_IN_ONE === 'true' || /subx-asr/i.test(baseUrl))) {
    candidates.push(local)
  }
  return candidates
}

function isCjkLanguage(language: string) {
  return /^(zh|ja|ko|th)/i.test(String(language || ''))
}

function isLikelyHallucination(segment: AsrSegment) {
  const text = String(segment.text || '').trim()
  if (!text) return true
  const normalized = text.toLowerCase()
  if (/^thank(s| you) for watching[.!]?$/i.test(text)) return true
  if (/^subtitles? by\b/i.test(text)) return true
  if (/^字幕由.+提供/.test(text)) return true
  if (/^请不吝点赞/.test(text)) return true
  if (/^amara\.org/i.test(text)) return true
  if (/^www\./i.test(text)) return true
  const words = (segment.words || []).map(word => String(word.word || '').trim().toLowerCase()).filter(Boolean)
  if (words.length >= 4 && new Set(words).size === 1) return true
  if (normalized === 'you' || normalized === 'thank you') return false
  return false
}

function wordConfidence(words: AsrWord[] | undefined): number | undefined {
  const values = (words || []).map(word => Number(word.probability)).filter(value => Number.isFinite(value) && value > 0)
  if (!values.length) return undefined
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function splitSegment(segment: AsrSegment, maxChars: number): AsrSegment[] {
  const words = segment.words || []
  const text = String(segment.text || '').trim()
  if (words.length < 2 || Array.from(text).length <= maxChars) return [segment]

  const pieces: AsrSegment[] = []
  let current: AsrWord[] = []
  let currentChars = 0
  let start = words[0]?.start ?? segment.start

  const flush = () => {
    if (!current.length) return
    const pieceText = current.map(word => String(word.word || '')).join('').trim()
    if (pieceText) {
      const pieceWords = [...current]
      pieces.push({
        ...segment,
        id: pieces.length + 1,
        start,
        end: pieceWords[pieceWords.length - 1]?.end ?? segment.end,
        text: pieceText,
        words: pieceWords,
        confidence: wordConfidence(pieceWords) ?? segment.confidence
      })
    }
    current = []
    currentChars = 0
  }

  for (const word of words) {
    const value = String(word.word || '')
    const length = Array.from(value).length
    const punctuationBreak = /[。！？!?；;，,、]$/.test(value.trim()) && currentChars >= Math.max(6, Math.floor(maxChars * 0.45))
    if (current.length > 0 && (currentChars + length > maxChars || punctuationBreak)) {
      flush()
      start = word.start
    }
    current.push(word)
    currentChars += length
  }
  flush()
  return pieces.length ? pieces : [segment]
}

function seconds(value: unknown): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0
}

function mapCloudWords(segments: AsrSegment[], words: any[]): AsrSegment[] {
  if (!Array.isArray(words) || !words.length) return segments
  return segments.map(segment => {
    const segmentWords = words
      .filter(word => seconds(word.start) < segment.end && seconds(word.end) > segment.start)
      .map(word => ({
        start: seconds(word.start),
        end: seconds(word.end),
        word: String(word.word || word.text || ''),
        probability: Number(word.probability)
      }))
      .filter(word => word.word)
    return {
      ...segment,
      words: segmentWords,
      confidence: segment.confidence || wordConfidence(segmentWords)
    }
  })
}

async function transcribeCloud(filePath: string, options: AsrOptions, signal?: AbortSignal): Promise<AsrResult> {
  if (!options.cloudEnabled) throw new Error('云 ASR 未启用')
  const baseUrl = normalizeBaseUrl(options.cloudBaseUrl || 'https://api.openai.com/v1')
  if (!baseUrl) throw new Error('云 ASR 地址未配置')

  let uploadPath = filePath
  let tempPath = ''
  try {
    if (statSync(filePath).size > CLOUD_MAX_BYTES) {
      tempPath = join(dirname(filePath), `${basename(filePath)}.cloud.mp3`)
      await VideoService.compressAudioForCloud(filePath, tempPath)
      uploadPath = tempPath
    }
    if (statSync(uploadPath).size > CLOUD_MAX_BYTES) {
      throw new Error('云 ASR 单文件超过 24MB，请缩短音频或使用本地 ASR')
    }

    const form = new FormData()
    form.append('file', new Blob([readFileSync(uploadPath)], { type: uploadPath.endsWith('.mp3') ? 'audio/mpeg' : 'audio/wav' }), basename(uploadPath))
    form.append('model', options.cloudModel || 'whisper-1')
    form.append('response_format', 'verbose_json')
    if (options.language && options.language !== 'auto') form.append('language', options.language)

    const timeout = new AbortController()
    const timer = setTimeout(() => timeout.abort(), CLOUD_TIMEOUT_MS)
    const headers: Record<string, string> = {}
    if (options.cloudApiKey) headers.Authorization = `Bearer ${options.cloudApiKey}`
    const started = Date.now()
    try {
      const response = await fetch(`${baseUrl}/audio/transcriptions`, {
        method: 'POST',
        headers,
        body: form,
        signal: combineSignal(signal, timeout)
      })
      if (!response.ok) {
        const detail = await response.text().catch(() => '')
        throw new Error(`云 ASR 请求失败 (${response.status}): ${detail.slice(0, 500)}`)
      }
      const data = await response.json() as any
      const rawSegments = Array.isArray(data.segments) && data.segments.length
        ? data.segments
        : [{ start: 0, end: Number(data.duration || 0), text: String(data.text || '') }]
      let segments: AsrSegment[] = rawSegments
        .map((segment: any, index: number) => {
          const avgLogprob = Number(segment.avg_logprob)
          const confidence = Number.isFinite(avgLogprob) ? Math.max(0, Math.min(1, Math.exp(avgLogprob))) : 0
          return {
            id: index + 1,
            start: seconds(segment.start),
            end: seconds(segment.end),
            text: String(segment.text || '').trim(),
            avgLogprob: Number.isFinite(avgLogprob) ? avgLogprob : undefined,
            noSpeechProb: Number(segment.no_speech_prob || 0),
            confidence,
            words: []
          }
        })
        .filter((segment: AsrSegment) => segment.text)
      segments = mapCloudWords(segments, data.words)
      if (!segments.length) throw new Error('云 ASR 未返回可用字幕分段')
      const duration = Number(data.duration || segments[segments.length - 1]?.end || 0)
      const elapsed = Math.max(0.001, (Date.now() - started) / 1000)
      return {
        task: 'transcribe',
        engine: 'cloud',
        provider: 'cloud',
        model: options.cloudModel || 'whisper-1',
        device: 'cloud',
        computeType: 'api',
        language: String(data.language || options.language || 'unknown'),
        duration,
        elapsed,
        rtf: duration > 0 ? elapsed / duration : 0,
        text: String(data.text || segments.map(segment => segment.text).join(' ')),
        segments
      }
    } finally {
      clearTimeout(timer)
    }
  } finally {
    if (tempPath && existsSync(tempPath)) {
      try { rmSync(tempPath, { force: true }) } catch { /* ignore */ }
    }
  }
}

export const AsrService = {
  async transcribe(filePath: string, options: AsrOptions, signal?: AbortSignal): Promise<AsrResult> {
    const engine = options.engine || 'auto'
    if (engine === 'cloud') return transcribeCloud(filePath, options, signal)

    const baseUrl = normalizeBaseUrl(options.baseUrl)
    if (!baseUrl) {
      if (options.cloudEnabled) return transcribeCloud(filePath, options, signal)
      throw new Error('ASR 地址未配置')
    }

    const audio = readFileSync(filePath)
    const fileName = basename(filePath)
    const candidates = asrCandidates(baseUrl)
    let localError: any = null

    for (const candidate of candidates) {
      try {
        if (candidate !== baseUrl) {
          console.warn(`[ASR] ${baseUrl} 连接失败，尝试内置地址 ${candidate}：${describeAsrError(localError)}`)
        }
        return await transcribeLocalWithRetry(candidate, fileName, audio, options, engine, signal)
      } catch (error: any) {
        localError = error
        if (!isAsrNetworkError(error)) break
      }
    }

    if (isAsrNetworkError(localError)) {
      localError = new Error(`无法连接 ASR 服务（已尝试 ${candidates.join(' / ')}）：${describeAsrError(localError)}`)
    }

    if (options.cloudEnabled && options.cloudFallback !== false) {
      try {
        console.warn('[ASR] 本地识别失败，尝试云 ASR 兜底:', localError?.message || localError)
        const result = await transcribeCloud(filePath, options, signal)
        return { ...result, preprocessWarning: `本地 ASR 失败，已使用云兜底：${localError?.message || localError}` }
      } catch (cloudError: any) {
        throw new Error(`本地 ASR 失败：${localError?.message || localError}；云 ASR 兜底失败：${cloudError?.message || cloudError}`)
      }
    }
    throw localError
  },

  toSubtitleEntries(result: AsrResult): SubtitleEntry[] {
    const maxChars = isCjkLanguage(result.language) ? 18 : 42
    const entries: SubtitleEntry[] = []

    for (const segment of result.segments) {
      if (isLikelyHallucination(segment)) continue
      for (const piece of splitSegment(segment, maxChars)) {
        const text = String(piece.text || '').trim()
        if (!text) continue
        const startMs = Math.max(0, Math.round(Number(piece.start || 0) * 1000))
        const endMs = Math.max(startMs + 300, Math.round(Number(piece.end || 0) * 1000))
        const confidence = Number(piece.confidence || 0)
        entries.push({
          id: String(entries.length + 1),
          startTime: SubtitleService.msToSrtTime(startMs),
          endTime: SubtitleService.msToSrtTime(endMs),
          text,
          translatedText: '',
          ...(confidence > 0 ? { asrConfidence: confidence } : {})
        } as SubtitleEntry)
      }
    }

    return entries
  },

  persistResult(taskId: string, result: AsrResult): AsrPersistedResult {
    const db = useDb()
    const confidenceValues = result.segments.map(segment => Number(segment.confidence || 0)).filter(value => value > 0)
    const confidence = confidenceValues.length
      ? confidenceValues.reduce((sum, value) => sum + value, 0) / confidenceValues.length
      : 0

    const run = db.prepare(`
      INSERT INTO transcription_runs (task_id, engine, model, device, language, duration_ms, rtf, confidence, raw_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `).run(
      taskId,
      result.engine || 'faster-whisper',
      result.model || '',
      result.device || '',
      result.language || 'unknown',
      Math.round(Number(result.duration || 0) * 1000),
      Number(result.rtf || 0),
      confidence,
      JSON.stringify(result)
    )

    const runId = Number(run.lastInsertRowid)
    const stmt = db.prepare(`
      INSERT INTO asr_segments (run_id, start_ms, end_ms, text, words_json, confidence, no_speech_prob, speaker, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `)
    for (const segment of result.segments) {
      stmt.run(
        runId,
        Math.round(Number(segment.start || 0) * 1000),
        Math.round(Number(segment.end || 0) * 1000),
        String(segment.text || ''),
        JSON.stringify(segment.words || []),
        Number(segment.confidence || 0),
        Number(segment.noSpeechProb || 0),
        segment.speaker || null
      )
    }
    return { runId, confidence }
  }
}
