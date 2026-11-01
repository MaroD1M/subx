import type { AsrResult } from '../asr/types'

const OCR_TIMEOUT_MS = 2 * 60 * 60 * 1000
const OCR_POLL_MS = 1500

export interface OcrOptions {
  baseUrl: string
  language?: string
  trackIndex: number
  apiKey?: string
  onProgress?: (progress: number, message: string) => void
}

function normalizeBaseUrl(value: string) {
  return String(value || '').trim().replace(/\/+$/, '')
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
      language: options.language || 'en'
    })
    const timeout = new AbortController()
    const timer = setTimeout(() => timeout.abort(), OCR_TIMEOUT_MS)
    try {
      const create = await fetch(`${baseUrl}/v1/subtitles/ocr/jobs`, {
        method: 'POST',
        headers,
        body,
        signal: typeof AbortSignal.any === 'function' ? AbortSignal.any([signal, timeout.signal].filter(Boolean) as AbortSignal[]) : (signal || timeout.signal)
      })
      if (create.status === 404) {
        return await this.transcribeSync(baseUrl, headers, body, options, signal)
      }
      if (!create.ok) {
        const detail = await create.text().catch(() => '')
        throw new Error(`OCR 任务创建失败 (${create.status}): ${detail.slice(0, 500)}`)
      }
      const created = await create.json() as { jobId?: string }
      const jobId = String(created.jobId || '')
      if (!jobId) throw new Error('OCR 服务未返回任务 ID')

      while (true) {
        if (signal?.aborted) {
          await fetch(`${baseUrl}/v1/subtitles/ocr/jobs/${jobId}/cancel`, { method: 'POST', headers }).catch(() => null)
          throw new Error('任务已取消')
        }
        await sleep(Number(process.env.OCR_POLL_MS || OCR_POLL_MS))
        const response = await fetch(`${baseUrl}/v1/subtitles/ocr/jobs/${jobId}`, { headers, signal: signal || timeout.signal })
        if (!response.ok) {
          const detail = await response.text().catch(() => '')
          throw new Error(`OCR 任务状态获取失败 (${response.status}): ${detail.slice(0, 300)}`)
        }
        const job = await response.json() as any
        const progress = Number(job.progress || 0)
        const message = String(job.message || '正在 OCR 识别')
        options.onProgress?.(progress, message)
        if (job.status === 'done' && job.result) {
          return normalizeResult(job.result as AsrResult, options.language || 'unknown')
        }
        if (job.status === 'error') throw new Error(String(job.error || 'OCR 失败'))
        if (job.status === 'cancelled') throw new Error('OCR 任务已取消')
      }
    } finally {
      clearTimeout(timer)
    }
  },

  async transcribeSync(baseUrl: string, headers: Record<string, string>, body: string, options: OcrOptions, signal?: AbortSignal): Promise<AsrResult> {
    const timeout = new AbortController()
    const timer = setTimeout(() => timeout.abort(), OCR_TIMEOUT_MS)
    try {
      const response = await fetch(`${baseUrl}/v1/subtitles/ocr`, {
        method: 'POST',
        headers,
        body,
        signal: typeof AbortSignal.any === 'function' ? AbortSignal.any([signal, timeout.signal].filter(Boolean) as AbortSignal[]) : (signal || timeout.signal)
      })
      if (!response.ok) {
        const detail = await response.text().catch(() => '')
        throw new Error(`OCR 请求失败 (${response.status}): ${detail.slice(0, 500)}`)
      }
      return normalizeResult(await response.json() as AsrResult, options.language || 'unknown')
    } finally {
      clearTimeout(timer)
    }
  }
}
