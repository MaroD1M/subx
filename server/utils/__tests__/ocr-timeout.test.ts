import { afterEach, describe, expect, it, vi } from 'vitest'
import { resolveOcrTimeouts } from '../ocr/client'
import { classifyTaskError } from '../taskError'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('OCR long-video timeout configuration', () => {
  it('uses app-configured idle and absolute timeouts', () => {
    expect(resolveOcrTimeouts({
      idleTimeoutMs: 45 * 60 * 1000,
      absoluteTimeoutMs: 8 * 60 * 60 * 1000
    })).toEqual({
      idle: 45 * 60 * 1000,
      absolute: 8 * 60 * 60 * 1000
    })
  })

  it('keeps safe lower bounds and never lets absolute be shorter than idle', () => {
    const timeouts = resolveOcrTimeouts({
      idleTimeoutMs: 0,
      absoluteTimeoutMs: 0
    })
    expect(timeouts.idle).toBeGreaterThanOrEqual(60_000)
    expect(timeouts.absolute).toBeGreaterThanOrEqual(10 * 60 * 1000)
    expect(timeouts.absolute).toBeGreaterThanOrEqual(timeouts.idle)

    const inverted = resolveOcrTimeouts({
      idleTimeoutMs: 4 * 60 * 60 * 1000,
      absoluteTimeoutMs: 10 * 60 * 1000
    })
    expect(inverted.absolute).toBeGreaterThanOrEqual(inverted.idle)
  })

  it('falls back to defaults for invalid timeout numbers', () => {
    const timeouts = resolveOcrTimeouts({
      idleTimeoutMs: Number.NaN,
      absoluteTimeoutMs: Number.POSITIVE_INFINITY
    })
    expect(Number.isFinite(timeouts.idle)).toBe(true)
    expect(Number.isFinite(timeouts.absolute)).toBe(true)
    expect(timeouts.idle).toBeGreaterThanOrEqual(60_000)
    expect(timeouts.absolute).toBeGreaterThanOrEqual(timeouts.idle)
  })

  it('classifies OCR duration limits before generic 5xx provider errors', () => {
    const limit = classifyTaskError('OCR 请求失败 (500): 视频时长 8503s 超过 OCR 最大处理时长 7200s')
    expect(limit.type).toBe('ocr_limit')
    expect(limit.summary).toContain('长视频与超时')

    const timeout = classifyTaskError('OCR 长时间没有进度（60 分钟），已取消远端任务')
    expect(timeout.type).toBe('ocr_timeout')
    expect(timeout.summary).toContain('无进度超时')
  })

  it('still classifies genuine provider 5xx errors as provider failures', () => {
    expect(classifyTaskError('upstream returned 503 service unavailable').type).toBe('provider')
  })
})
