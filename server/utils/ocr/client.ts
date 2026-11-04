import type { AsrResult } from '../asr/types'

const OCR_POLL_MS = 1500
const OCR_POLL_TIMEOUT_MS = 30_000
const OCR_CREATE_TIMEOUT_MS = 60_000
const OCR_DEFAULT_IDLE_TIMEOUT_MS = 60 * 60 * 1000
const OCR_DEFAULT_ABSOLUTE_TIMEOUT_MS = 6 * 60 * 60 * 1000

export interface OcrOptions {
  baseUrl: string
  language?: string
  trackIndex: number
  apiKey?: string
  engine?: string
  minConfidence?: number
  maxSeconds?: number
  chunkSeconds?: number
  pgsripTimeoutSeconds?: number
  ffmpegTimeoutSeconds?: number
  chunkRetries?: number
  resumeTtlHours?: number
  idleTimeoutMs?: number
  absoluteTimeoutMs?: number
  onProgress?: (progress: number, message: string) => void
}

function finiteNumber(value: unknown, fallback: number) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

export function resolveOcrTimeouts(options: Pick<OcrOptions, 'idleTimeoutMs' | 'absoluteTimeoutMs'> = {}) {
  const envIdle = finiteNumber(process.env.OCR_JOB_IDLE_TIMEOUT_MS, OCR_DEFAULT_IDLE_TIMEOUT_MS)
  const envAbsolute = finiteNumber(process.env.OCR_JOB_ABSOLUTE_TIMEOUT_MS, OCR_DEFAULT_ABSOLUTE_TIMEOUT_MS)
  const idle = Math.max(60_000, Math.min(24 * 60 * 60 * 1000, finiteNumber(options.idleTimeoutMs, envIdle)))
  const absolute = Math.max(
    10 * 60 * 1000,
    Math.min(7 * 24 * 60 * 60 * 1000, finiteNumber(options.absoluteTimeoutMs, envAbsolute))
  )
  return { idle, absolute: Math.max(idle, absolute) }
}

function normalizeBaseUrl(value: string) {
  return String(value || '').trim().replace(/\/+$/, '')
}

function combineSignals(signals: Array<AbortSignal | undefined>) {
  const valid = signals.filter(Boolean) as AbortSignal[]
  if (valid.length === 0) return undefined
  if (valid.length === 1) return valid[0]
  if (typeof AbortSignal.any === 'function') return AbortSignal.any(valid)
  const controller = new AbortController()
  const abort = () => controller.abort()
  for (const item of valid) {
    if (item.aborted) {
      abort()
      break
    }
    item.addEventListener('abort', abort, { once: true })
  }
  return controller.signal
}

function normalizeResult(data: AsrResult, fallbackLanguage: string): AsrResult {
  if (!Array.isArray(data.segments) || data.segments.length === 0) {
    throw new Error('OCR 未返回可用字幕分段')
  }
  return {
    ...data,
    engine: data.engine || 'ocr',
    language: String(data.language || fallbackLanguage || 'unknown'),
    duration: Number(data.duration || 0),
    text: String(data.text || ''),
    segments: data.segments.filter(segment => String(segment.text || '').trim())
  }
}

async function sleep(ms: number) {
  await new Promise(resolve => setTimeout(resolve, ms))
}

export const OcrService = {
  async transcribe(filePath: string, options: OcrOptions, signal?: AbortSignal): Promise<AsrResult> {
    const baseUrl = normalizeBaseUrl(options.baseUrl)
    if (!baseUrl) throw new Error('OCR 服务地址未配置')
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (options.apiKey) headers.Authorization = `Bearer ${options.apiKey}`
    const body = JSON.stringify({
      path: filePath,
      track_index: options.trackIndex,
      language: options.language || 'en',
      engine: options.engine || undefined,
      min_confidence: options.minConfidence,
      max_seconds: options.maxSeconds,
      chunk_seconds: options.chunkSeconds,
      pgsrip_timeout_seconds: options.pgsripTimeoutSeconds,
      ffmpeg_timeout_seconds: options.ffmpegTimeoutSeconds,
      chunk_retries: options.chunkRetries,
      resume_ttl_hours: options.resumeTtlHours
    })
    const timeouts = resolveOcrTimeouts(options)
    const startedAt = Date.now()
    let lastProgressAt = Date.now()
    let lastProgress = -1
    let lastMessage = ''
    let jobId = ''
    let jobFinished = false

    const cancelJob = async () => {
      if (!jobId) return
      await fetch(`${baseUrl}/v1/subtitles/ocr/jobs/${jobId}/cancel`, {
        method: 'POST',
        headers,
        signal: AbortSignal.timeout(10_000)
      }).catch(() => null)
    }

    try {
      const create = await fetch(`${baseUrl}/v1/subtitles/ocr/jobs`, {
        method: 'POST',
        headers,
        body,
        signal: combineSignals([signal, AbortSignal.timeout(OCR_CREATE_TIMEOUT_MS)])
      })
      if (create.status === 404) {
        return await this.transcribeSync(baseUrl, headers, body, options, signal, timeouts.absolute)
      }
      if (!create.ok) {
        const detail = await create.text().catch(() => '')
        throw new Error(`OCR 任务创建失败 (${create.status}): ${detail.slice(0, 500)}`)
      }
      const created = await create.json() as { jobId?: string }
      jobId = String(created.jobId || '')
      if (!jobId) throw new Error('OCR 服务未返回任务 ID')

      while (true) {
        if (signal?.aborted) {
          await cancelJob()
          throw new Error('任务已取消')
        }
        const now = Date.now()
        if (now - lastProgressAt > timeouts.idle) {
          await cancelJob()
          throw new Error(
            `OCR 长时间没有进度（${Math.round(timeouts.idle / 60000)} 分钟），已取消远端任务；`
            + '请在“设置 → 图像字幕 OCR → 长视频与超时”调大无进度超时'
          )
        }
        if (now - startedAt > timeouts.absolute) {
          await cancelJob()
          throw new Error(
            `OCR 任务超过最长执行时间（${Math.round(timeouts.absolute / 3600000)} 小时），已取消远端任务；`
            + '请调大总任务上限，或缩短分段时长'
          )
        }
        await sleep(Number(process.env.OCR_POLL_MS || OCR_POLL_MS))
        const response = await fetch(`${baseUrl}/v1/subtitles/ocr/jobs/${jobId}`, {
          headers,
          signal: combineSignals([signal, AbortSignal.timeout(OCR_POLL_TIMEOUT_MS)])
        })
        if (!response.ok) {
          const detail = await response.text().catch(() => '')
          throw new Error(`OCR 任务状态获取失败 (${response.status}): ${detail.slice(0, 300)}`)
        }
        const job = await response.json() as any
        const progress = Number(job.progress || 0)
        const message = String(job.message || '正在 OCR 识别')
        if (progress !== lastProgress || message !== lastMessage) {
          lastProgressAt = Date.now()
        }
        lastProgress = progress
        lastMessage = message
        options.onProgress?.(progress, message)
        if (job.status === 'done' && job.result) {
          jobFinished = true
          return normalizeResult(job.result as AsrResult, options.language || 'unknown')
        }
        if (job.status === 'error') {
          jobFinished = true
          throw new Error(String(job.error || 'OCR 失败'))
        }
        if (job.status === 'cancelled') {
          jobFinished = true
          throw new Error('OCR 任务已取消')
        }
      }
    } catch (error: any) {
      if (jobId && !jobFinished) await cancelJob()
      if (signal?.aborted) throw new Error('任务已取消')
      if (error?.name === 'TimeoutError' || error?.name === 'AbortError') {
        throw new Error('OCR 服务请求超时，请检查服务负载或调大无进度超时')
      }
      throw error
    }
  },

  async transcribeSync(
    baseUrl: string,
    headers: Record<string, string>,
    body: string,
    options: OcrOptions,
    signal?: AbortSignal,
    timeoutMs = OCR_DEFAULT_ABSOLUTE_TIMEOUT_MS
  ): Promise<AsrResult> {
    const response = await fetch(`${baseUrl}/v1/subtitles/ocr`, {
      method: 'POST',
      headers,
      body,
      signal: combineSignals([signal, AbortSignal.timeout(timeoutMs)])
    })
    if (!response.ok) {
      const detail = await response.text().catch(() => '')
      throw new Error(`OCR 请求失败 (${response.status}): ${detail.slice(0, 500)}`)
    }
    return normalizeResult(await response.json() as AsrResult, options.language || 'unknown')
  }
}
