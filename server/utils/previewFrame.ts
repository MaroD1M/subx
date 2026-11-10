import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import ffmpeg from 'fluent-ffmpeg'
import type { SubtitleEntry, SubtitleOutputStyle } from '../../types'
import { normalizeSubtitleStyle } from '../../shared/subtitleStyles'
import { SubtitleService } from './subtitle'

export type PreviewOutputMode = 'translated' | 'bilingual' | 'original'
export type PreviewBilingualLayout = 'translated_first' | 'original_first'

export interface PreviewFrameOptions {
  inputPath: string
  time: number
  width: number
  height: number
  outputMode: PreviewOutputMode
  bilingualLayout: PreviewBilingualLayout
  subtitleStyle: SubtitleOutputStyle
  originalText: string
  translatedText: string
}

export interface PreviewFrameResult {
  filePath: string
  width: number
  height: number
  time: number
  cached: boolean
}

const PREVIEW_DIR = join(process.cwd(), 'temp', 'preview')
const PREVIEW_TTL_MS = 24 * 60 * 60 * 1000
const PRUNE_INTERVAL_MS = 10 * 60 * 1000
const RENDER_TIMEOUT_MS = 60 * 1000

let lastPruneAt = 0

export function quoteAssFilterPath(filePath: string): string {
  const normalized = String(filePath || '').replace(/\\/g, '/')
  return `'${normalized.replace(/'/g, "\\'")}'`
}

export function buildPreviewAssContent(options: Pick<PreviewFrameOptions, 'outputMode' | 'bilingualLayout' | 'subtitleStyle' | 'originalText' | 'translatedText'>): string {
  const entry: SubtitleEntry = {
    id: 'preview',
    startTime: '00:00:00,000',
    endTime: '00:00:10,000',
    text: String(options.originalText || ''),
    translatedText: String(options.translatedText || '')
  }
  return SubtitleService.buildStyledAssContent(
    [entry],
    options.outputMode,
    options.bilingualLayout,
    normalizeSubtitleStyle(options.subtitleStyle, options.outputMode)
  )
}

function previewCacheKey(options: PreviewFrameOptions): string {
  const info = statSync(options.inputPath)
  const style = normalizeSubtitleStyle(options.subtitleStyle, options.outputMode)
  return createHash('sha256')
    .update(JSON.stringify({
      inputPath: options.inputPath,
      size: info.size,
      mtimeMs: Math.round(info.mtimeMs),
      timeMs: Math.round(options.time * 1000),
      width: options.width,
      height: options.height,
      outputMode: options.outputMode,
      bilingualLayout: options.bilingualLayout,
      subtitleStyle: style,
      originalText: options.originalText,
      translatedText: options.translatedText
    }))
    .digest('hex')
    .slice(0, 32)
}

function prunePreviewCache() {
  const now = Date.now()
  if (now - lastPruneAt < PRUNE_INTERVAL_MS) return
  lastPruneAt = now
  try {
    for (const name of readdirSync(PREVIEW_DIR)) {
      const filePath = join(PREVIEW_DIR, name)
      try {
        if (now - statSync(filePath).mtimeMs > PREVIEW_TTL_MS) unlinkSync(filePath)
      } catch { /* ignore individual cleanup failures */ }
    }
  } catch { /* preview directory may not exist yet */ }
}

function renderFrame(options: PreviewFrameOptions, assPath: string, outputPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false
    let command: ReturnType<typeof ffmpeg> | null = null
    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      try { command?.kill('SIGKILL') } catch { /* ignore kill failure */ }
      reject(new Error('字幕预览图生成超时'))
    }, RENDER_TIMEOUT_MS)

    const finish = (error?: Error) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      if (error) reject(error)
      else resolve()
    }

    command = ffmpeg(options.inputPath)
      .seekInput(Math.max(0, options.time))
      .videoFilters(`ass=${quoteAssFilterPath(assPath)}`)
      .outputOptions(['-frames:v 1', '-an', '-sn', '-vsync', '0'])
      .output(outputPath)

    command
      .on('error', (error: Error) => finish(new Error(`字幕预览图生成失败：${error.message}`)))
      .on('end', () => finish())
      .run()
  })
}

export async function renderPreviewFrame(options: PreviewFrameOptions): Promise<PreviewFrameResult> {
  mkdirSync(PREVIEW_DIR, { recursive: true })
  prunePreviewCache()

  const key = previewCacheKey(options)
  const outputPath = join(PREVIEW_DIR, `${key}.png`)
  if (existsSync(outputPath)) {
    return {
      filePath: outputPath,
      width: options.width,
      height: options.height,
      time: options.time,
      cached: true
    }
  }

  const assPath = join(PREVIEW_DIR, `${key}.ass`)
  writeFileSync(assPath, buildPreviewAssContent(options), 'utf-8')
  try {
    await renderFrame(options, assPath, outputPath)
  } catch (error) {
    try { unlinkSync(assPath) } catch { /* ignore cleanup failure */ }
    try { unlinkSync(outputPath) } catch { /* ignore cleanup failure */ }
    throw error
  }
  try { unlinkSync(assPath) } catch { /* ignore cleanup failure */ }

  return {
    filePath: outputPath,
    width: options.width,
    height: options.height,
    time: options.time,
    cached: false
  }
}
