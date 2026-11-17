import { useDb } from './db'

export type TaskErrorType =
  | 'auth'
  | 'rate_limit'
  | 'model'
  | 'network'
  | 'timeout'
  | 'provider'
  | 'parse'
  | 'content'
  | 'ocr_limit'
  | 'ocr_timeout'
  | 'unknown'

export type TaskRetryBackoff = 'fixed' | 'exponential'

export interface TaskRetryPolicy {
  maxAttempts: number
  backoff: TaskRetryBackoff
  baseSeconds: number
  maxSeconds: number
  retryOn: TaskErrorType[]
}

export const DEFAULT_RETRYABLE_ERRORS: TaskErrorType[] = [
  'network',
  'timeout',
  'rate_limit',
  'provider',
  'parse'
]

export const DEFAULT_TASK_RETRY_POLICY: TaskRetryPolicy = {
  maxAttempts: 3,
  backoff: 'exponential',
  baseSeconds: 30,
  maxSeconds: 600,
  retryOn: DEFAULT_RETRYABLE_ERRORS
}

const ALL_ERROR_TYPES: TaskErrorType[] = [
  'auth',
  'rate_limit',
  'model',
  'network',
  'timeout',
  'provider',
  'parse',
  'content',
  'ocr_limit',
  'ocr_timeout',
  'unknown'
]

function clampInt(value: unknown, fallback: number, min: number, max: number) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.max(min, Math.min(max, Math.floor(parsed)))
}

export function normalizeTaskRetryPolicy(input: unknown): TaskRetryPolicy {
  const raw = input && typeof input === 'object' && !Array.isArray(input)
    ? input as Record<string, unknown>
    : {}
  const requested = Array.isArray(raw.retryOn)
    ? raw.retryOn.map(item => String(item)).filter((item): item is TaskErrorType => ALL_ERROR_TYPES.includes(item as TaskErrorType))
    : []
  return {
    maxAttempts: clampInt(raw.maxAttempts, DEFAULT_TASK_RETRY_POLICY.maxAttempts, 1, 10),
    backoff: raw.backoff === 'fixed' ? 'fixed' : 'exponential',
    baseSeconds: clampInt(raw.baseSeconds, DEFAULT_TASK_RETRY_POLICY.baseSeconds, 5, 3600),
    maxSeconds: clampInt(raw.maxSeconds, DEFAULT_TASK_RETRY_POLICY.maxSeconds, 5, 24 * 60 * 60),
    retryOn: requested.length ? Array.from(new Set(requested)) : [...DEFAULT_RETRYABLE_ERRORS]
  }
}

export function shouldRetryTaskError(policy: TaskRetryPolicy, errorType: TaskErrorType): boolean {
  return policy.retryOn.includes(errorType)
}

export function retryDelaySeconds(policy: TaskRetryPolicy, attempt: number): number {
  const currentAttempt = Math.max(1, Math.floor(Number(attempt) || 1))
  if (policy.backoff === 'fixed') return policy.baseSeconds
  const exponential = policy.baseSeconds * Math.pow(2, currentAttempt - 1)
  return Math.min(policy.maxSeconds, Math.max(policy.baseSeconds, Math.floor(exponential)))
}

export interface TaskRetryContext {
  attempts: number
  maxAttempts: number
  policy: TaskRetryPolicy
}

export function getTaskRetryContext(taskId: string): TaskRetryContext | null {
  try {
    const row = useDb().prepare(`
      SELECT attempts, max_attempts, retry_policy_json
      FROM task_jobs
      WHERE task_id = ?
    `).get(taskId) as { attempts?: number, max_attempts?: number, retry_policy_json?: string } | undefined
    if (!row) return null
    let parsed: unknown = {}
    try { parsed = JSON.parse(String(row.retry_policy_json || '{}')) } catch { parsed = {} }
    const policy = normalizeTaskRetryPolicy(parsed)
    return {
      attempts: Math.max(0, Number(row.attempts || 0)),
      maxAttempts: Math.max(1, Number(row.max_attempts || policy.maxAttempts)),
      policy
    }
  } catch {
    return null
  }
}
