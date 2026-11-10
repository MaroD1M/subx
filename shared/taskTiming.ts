import { parseTimestamp } from './time'

export interface TaskTimingInput {
  status?: string
  progress?: number
  stepProgress?: number
  completedChunks?: number
  totalChunks?: number
  createdAt?: unknown
  updatedAt?: unknown
  startedAt?: unknown
  stepStartedAt?: unknown
  finishedAt?: unknown
  pausedAt?: unknown
  pausedTotalMs?: number
}

export interface TaskProgressSample {
  at: number
  progress: number
}

export interface TaskEtaEstimate {
  overallMs: number | null
  stageMs: number | null
}

const TERMINAL_STATUSES = new Set(['done', 'error', 'cancelled', 'review'])
const ACTIVE_STATUSES = new Set(['probing', 'extracting', 'extracting_audio', 'transcribing', 'ocr', 'parsing', 'translating', 'exporting'])

function timestampMs(value: unknown): number | null {
  const parsed = parseTimestamp(value)
  return parsed ? parsed.getTime() : null
}

function clampMs(value: number): number {
  return Math.max(0, Math.round(value))
}

export function computeActiveElapsedMs(input: TaskTimingInput, now = Date.now()): number {
  const start = timestampMs(input.startedAt) ?? timestampMs(input.createdAt)
  if (start == null) return 0

  const status = String(input.status || '')
  const terminal = TERMINAL_STATUSES.has(status)
  const paused = status === 'paused'
  const end = timestampMs(input.finishedAt)
    ?? (paused ? timestampMs(input.pausedAt) : null)
    ?? (terminal ? timestampMs(input.updatedAt) : null)
    ?? now
  return clampMs(end - start - Math.max(0, Number(input.pausedTotalMs || 0)))
}

export function computeStageElapsedMs(input: TaskTimingInput, now = Date.now()): number {
  const start = timestampMs(input.stepStartedAt)
  if (start == null) return 0
  const status = String(input.status || '')
  const paused = status === 'paused'
  const end = timestampMs(input.finishedAt)
    ?? (paused ? timestampMs(input.pausedAt) : null)
    ?? now
  return clampMs(end - start)
}

function stageEtaMs(input: TaskTimingInput, now: number): number | null {
  const status = String(input.status || '')
  if (!ACTIVE_STATUSES.has(status)) return null
  const stepProgress = Math.max(0, Math.min(100, Number(input.stepProgress || 0)))
  if (stepProgress <= 1 || stepProgress >= 100) return null
  const stageElapsed = computeStageElapsedMs(input, now)
  if (stageElapsed < 5_000) return null
  return clampMs(stageElapsed * ((100 - stepProgress) / stepProgress))
}

export function computeTaskEtaMs(input: TaskTimingInput, samples: TaskProgressSample[] = [], now = Date.now()): TaskEtaEstimate {
  const status = String(input.status || '')
  if (!ACTIVE_STATUSES.has(status)) return { overallMs: null, stageMs: null }

  const stageMs = stageEtaMs(input, now)
  const progress = Math.max(0, Math.min(100, Number(input.progress || 0)))
  if (progress <= 0 || progress >= 100) return { overallMs: stageMs, stageMs }

  const recent = samples
    .filter(sample => Number.isFinite(sample.at) && Number.isFinite(sample.progress) && now - sample.at <= 120_000)
    .sort((a, b) => a.at - b.at)
  const first = recent[0]
  const last = recent[recent.length - 1]
  let overallMs: number | null = null
  if (first && last) {
    const span = last.at - first.at
    const delta = last.progress - first.progress
    if (span >= 20_000 && delta >= 1) {
      const rate = delta / span
      if (rate > 0) overallMs = clampMs((100 - progress) / rate)
    }
  }

  if (overallMs == null && progress >= 5) {
    const elapsed = computeActiveElapsedMs(input, now)
    if (elapsed >= 30_000) overallMs = clampMs(elapsed * ((100 - progress) / progress))
  }

  return { overallMs: overallMs ?? stageMs, stageMs }
}

export function smoothEtaMs(previous: number | null, next: number | null, alpha = 0.3): number | null {
  if (next == null) return previous
  if (previous == null) return next
  return clampMs(previous * (1 - alpha) + next * alpha)
}

export function formatDuration(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(Number(ms))) return '-'
  const totalSeconds = Math.max(0, Math.round(Number(ms) / 1000))
  if (totalSeconds < 60) return `${totalSeconds} 秒`
  const totalMinutes = Math.floor(totalSeconds / 60)
  if (totalMinutes < 60) return `${totalMinutes} 分钟`
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  if (hours < 24) return minutes > 0 ? `${hours} 小时 ${minutes} 分钟` : `${hours} 小时`
  const days = Math.floor(hours / 24)
  const remainHours = hours % 24
  return remainHours > 0 ? `${days} 天 ${remainHours} 小时` : `${days} 天`
}
