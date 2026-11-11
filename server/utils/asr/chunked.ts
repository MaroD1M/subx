import { createHash } from 'crypto'
import { existsSync, rmSync, statSync } from 'fs'
import { join } from 'path'
import ffmpeg from 'fluent-ffmpeg'
import { useDb } from '../db'
import type { TranslationTask } from '~~/types'
import { AsrService } from './client'
import type { AsrOptions, AsrResult, AsrSegment } from './types'

const DEFAULT_CHUNK_SECONDS = Math.max(60, Number(process.env.ASR_CHUNK_SECONDS || 300))
const DEFAULT_OVERLAP_SECONDS = Math.max(0, Number(process.env.ASR_CHUNK_OVERLAP_SECONDS || 2))
const parsedMaxChunks = Number(process.env.ASR_MAX_CHUNKS || 500)
const MAX_CHUNKS = Number.isFinite(parsedMaxChunks) && parsedMaxChunks > 0 ? Math.floor(parsedMaxChunks) : 500

interface ChunkPlan {
  index: number
  startMs: number
  endMs: number
}

interface CheckpointRow {
  chunk_index: number
  start_ms: number
  end_ms: number
  status: string
  language?: string
  confidence?: number
  engine?: string
  model?: string
  segments_json: string
}

function normalizeText(text: string) {
  return String(text || '').toLowerCase().replace(/[\s\p{P}]+/gu, '')
}

function probeDurationSeconds(filePath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (error, metadata) => {
      if (error) return reject(error)
      const duration = Number(metadata?.format?.duration || 0)
      if (!Number.isFinite(duration) || duration <= 0) return reject(new Error('无法获取音频时长'))
      resolve(duration)
    })
  })
}

export function buildAsrChunkPlan(durationSeconds: number, chunkSeconds = DEFAULT_CHUNK_SECONDS, overlapSeconds = DEFAULT_OVERLAP_SECONDS): ChunkPlan[] {
  const durationMs = Math.max(0, Math.round(durationSeconds * 1000))
  const chunkMs = Math.max(60_000, Math.round(chunkSeconds * 1000))
  const overlapMs = Math.max(0, Math.min(chunkMs / 2, Math.round(overlapSeconds * 1000)))
  if (durationMs <= chunkMs + overlapMs) {
    return [{ index: 0, startMs: 0, endMs: durationMs }]
  }
  const plan: ChunkPlan[] = []
  let startMs = 0
  let index = 0
  while (startMs < durationMs) {
    if (plan.length >= MAX_CHUNKS) {
      throw new Error(`音频过长：分段数量超过上限 ${MAX_CHUNKS}，请缩短音频或调大 ASR_MAX_CHUNKS`)
    }
    const endMs = Math.min(durationMs, startMs + chunkMs + (index > 0 ? overlapMs : 0))
    plan.push({ index, startMs, endMs })
    startMs += chunkMs
    index++
  }
  return plan
}

export async function buildAsrCheckpointKey(task: TranslationTask, options: AsrOptions, audioPath: string, sourcePath?: string, chunkSeconds = DEFAULT_CHUNK_SECONDS, overlapSeconds = DEFAULT_OVERLAP_SECONDS) {
  const info = statSync(sourcePath || audioPath)
  const cloudEnabled = options.cloudEnabled === true
  const payload = JSON.stringify({
    filePath: task.filePath,
    rootId: task.rootId || '',
    trackIndex: task.trackIndex ?? 0,
    size: info.size,
    mtimeMs: Math.round(info.mtimeMs),
    model: options.model || '',
    language: options.language || 'auto',
    engine: options.engine || 'auto',
    device: options.device || 'auto',
    computeType: options.computeType || '',
    vad: options.vad !== false,
    wordTimestamps: options.wordTimestamps !== false,
    diarize: options.diarize === true,
    preprocess: options.preprocess || 'off',
    cloudEnabled,
    ...(cloudEnabled ? { cloudBaseUrl: options.cloudBaseUrl || '', cloudModel: options.cloudModel || '' } : {}),
    cloudFallback: options.cloudFallback !== false,
    chunkSeconds,
    overlapSeconds
  })
  return createHash('sha256').update(payload).digest('hex')
}

function loadCheckpoints(checkpointKey: string) {
  try {
    const rows = useDb().prepare(`
      SELECT chunk_index, start_ms, end_ms, status, language, confidence, engine, model, segments_json
      FROM asr_checkpoints WHERE checkpoint_key = ? AND status = 'done'
    `).all(checkpointKey) as CheckpointRow[]
    return new Map(rows.map(row => [Number(row.chunk_index), row]))
  } catch {
    return new Map<number, CheckpointRow>()
  }
}

function saveCheckpoint(checkpointKey: string, plan: ChunkPlan, result: AsrResult) {
  const confidenceValues = result.segments.map(segment => Number(segment.confidence || 0)).filter(value => value > 0)
  const confidence = confidenceValues.length ? confidenceValues.reduce((sum, value) => sum + value, 0) / confidenceValues.length : 0
  useDb().prepare(`
    INSERT INTO asr_checkpoints (
      checkpoint_key, chunk_index, start_ms, end_ms, status, language, confidence, engine, model, segments_json, updated_at
    ) VALUES (?, ?, ?, ?, 'done', ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(checkpoint_key, chunk_index) DO UPDATE SET
      start_ms=excluded.start_ms, end_ms=excluded.end_ms, status=excluded.status,
      language=excluded.language, confidence=excluded.confidence, engine=excluded.engine,
      model=excluded.model, segments_json=excluded.segments_json, updated_at=datetime('now')
  `).run(
    checkpointKey,
    plan.index,
    plan.startMs,
    plan.endMs,
    result.language || 'unknown',
    confidence,
    result.engine || '',
    result.model || '',
    JSON.stringify(result.segments || [])
  )
}

function extractChunk(sourcePath: string, targetPath: string, startMs: number, endMs: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const command = ffmpeg(sourcePath)
      .seekInput(Math.max(0, startMs / 1000))
      .duration(Math.max(0.1, (endMs - startMs) / 1000))
      .outputOptions(['-vn', '-ac 1', '-ar 16000', '-c:a pcm_s16le'])
      .output(targetPath)
    const cleanup = () => signal?.removeEventListener('abort', onAbort)
    const onAbort = () => {
      try { command.kill('SIGKILL') } catch { /* ignore */ }
      cleanup()
      reject(new Error('音频分段已取消'))
    }
    if (signal?.aborted) {
      reject(new Error('音频分段已取消'))
      return
    }
    signal?.addEventListener('abort', onAbort, { once: true })
    command
      .on('error', (error) => { cleanup(); reject(error) })
      .on('end', () => { cleanup(); resolve() })
      .run()
  })
}

function offsetSegments(segments: AsrSegment[], offsetSeconds: number): AsrSegment[] {
  return segments.map(segment => ({
    ...segment,
    start: Number(segment.start || 0) + offsetSeconds,
    end: Number(segment.end || 0) + offsetSeconds,
    words: Array.isArray(segment.words)
      ? segment.words.map(word => ({
          ...word,
          start: Number(word.start || 0) + offsetSeconds,
          end: Number(word.end || 0) + offsetSeconds
        }))
      : undefined
  }))
}

export function mergeChunkResults(results: Array<{ plan: ChunkPlan, result: AsrResult, reused: boolean }>): AsrResult {
  const segments: AsrSegment[] = []
  for (const item of results) {
    const absolute = offsetSegments(item.result.segments || [], item.plan.startMs / 1000)
    for (const segment of absolute) {
      if (!String(segment.text || '').trim()) continue
      const normalized = normalizeText(segment.text)
      const previous = segments[segments.length - 1]
      if (previous && normalized) {
        const overlap = Math.min(previous.end, segment.end) - Math.max(previous.start, segment.start)
        const shorter = Math.min(previous.end - previous.start, segment.end - segment.start)
        const previousNormalized = normalizeText(previous.text)
        if (overlap > 0 && shorter > 0 && overlap / shorter > 0.6
          && (normalized === previousNormalized || normalized.includes(previousNormalized) || previousNormalized.includes(normalized))) {
          if ((Number(segment.confidence || 0) > Number(previous.confidence || 0))
            || (segment.end - segment.start > previous.end - previous.start)) {
            segments[segments.length - 1] = segment
          }
          continue
        }
      }
      segments.push(segment)
    }
  }
  segments.sort((a, b) => Number(a.start || 0) - Number(b.start || 0) || Number(a.end || 0) - Number(b.end || 0))
  const normalizedSegments = segments.map((segment, index) => ({ ...segment, id: index + 1 }))
  const language = results.find(item => item.result.language && item.result.language !== 'unknown')?.result.language || 'unknown'
  const endSeconds = results.length ? results[results.length - 1]!.plan.endMs / 1000 : 0
  const engine = results[0]?.result.engine || 'asr'
  return {
    task: 'transcribe',
    engine,
    model: results[0]?.result.model || '',
    language,
    duration: endSeconds,
    text: normalizedSegments.map(segment => segment.text).join(' '),
    segments: normalizedSegments,
    diagnostics: {
      chunked: true,
      chunks: results.length,
      reusedChunks: results.filter(item => item.reused).length
    }
  } as AsrResult
}

export async function transcribeChunked(options: {
  audioPath: string
  sourcePath?: string
  chunkSeconds?: number
  overlapSeconds?: number
  task: TranslationTask
  asrOptions: AsrOptions
  taskId: string
  tempDir: string
  signal?: AbortSignal
  ensureNotPaused?: () => Promise<void>
  onProgress?: (progress: number, message: string) => void
  onCheckpointKey?: (checkpointKey: string) => void
}) {
  const { audioPath, sourcePath, chunkSeconds = DEFAULT_CHUNK_SECONDS, overlapSeconds = DEFAULT_OVERLAP_SECONDS, task, asrOptions, taskId, tempDir, signal, ensureNotPaused, onProgress, onCheckpointKey } = options
  const duration = await probeDurationSeconds(audioPath)
  const plan = buildAsrChunkPlan(duration, chunkSeconds, overlapSeconds)
  const checkpointKey = await buildAsrCheckpointKey(task, asrOptions, audioPath, sourcePath, chunkSeconds, overlapSeconds)
  onCheckpointKey?.(checkpointKey)
  const checkpoints = loadCheckpoints(checkpointKey)
  const results: Array<{ plan: ChunkPlan, result: AsrResult, reused: boolean }> = []
  let reusable = 0

  for (let index = 0; index < plan.length; index++) {
    const chunk = plan[index]!
    await ensureNotPaused?.()
    const existing = checkpoints.get(chunk.index)
    if (existing) {
      reusable++
      results.push({
        plan: chunk,
        reused: true,
        result: {
          task: 'transcribe',
          engine: existing.engine || 'cached',
          model: existing.model || '',
          language: existing.language || 'unknown',
          duration: (chunk.endMs - chunk.startMs) / 1000,
          text: '',
          segments: JSON.parse(existing.segments_json || '[]')
        }
      })
      onProgress?.(Math.round(((index + 1) / plan.length) * 100), `已复用识别分段 ${index + 1}/${plan.length}`)
      continue
    }

    const chunkPath = plan.length === 1 && chunk.startMs === 0
      ? audioPath
      : join(tempDir, `${taskId}.asr-chunk-${index}.wav`)
    let shouldRemoveChunk = chunkPath !== audioPath
    try {
      if (shouldRemoveChunk && !existsSync(chunkPath)) {
        await extractChunk(audioPath, chunkPath, chunk.startMs, chunk.endMs, signal)
      }
      const chunkOptions: AsrOptions = {
        ...asrOptions,
        onProgress: (progress, message) => {
          const base = index / plan.length
          const overall = Math.min(100, Math.round((base + (Number(progress || 0) / 100) / plan.length) * 100))
          onProgress?.(overall, `分段 ${index + 1}/${plan.length}：${message}`)
        }
      }
      const result = await AsrService.transcribe(chunkPath, chunkOptions, signal)
      const segmentCount = result.segments?.length || 0
      if (segmentCount > 0) {
        saveCheckpoint(checkpointKey, chunk, result)
        onProgress?.(Math.round(((index + 1) / plan.length) * 100), `识别分段 ${index + 1}/${plan.length} 完成`)
      } else {
        console.warn(`[ASR] 分段 ${index + 1}/${plan.length} 未检测到语音，跳过且不写入检查点`)
        onProgress?.(Math.round(((index + 1) / plan.length) * 100), `分段 ${index + 1}/${plan.length} 未检测到语音，已跳过`)
      }
      results.push({ plan: chunk, result, reused: false })
    } finally {
      if (shouldRemoveChunk && existsSync(chunkPath)) {
        try { rmSync(chunkPath, { force: true }) } catch { /* ignore */ }
      }
    }
  }

  const merged = mergeChunkResults(results)
  return { result: merged, checkpointKey, reusedChunks: reusable, totalChunks: plan.length }
}
