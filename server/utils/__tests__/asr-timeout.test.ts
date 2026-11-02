import { afterEach, describe, expect, it, vi } from 'vitest'
import { resolveAsrTimeouts } from '../asr/client'
import { classifyTaskError } from '../taskError'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('ASR long job timeout configuration', () => {
  it('uses user-configured values', () => {
    expect(resolveAsrTimeouts({
      baseUrl: 'http://asr.test',
      uploadTimeoutMs: 10 * 60 * 1000,
      pollTimeoutMs: 15 * 1000,
      jobIdleTimeoutMs: 45 * 60 * 1000,
      jobAbsoluteTimeoutMs: 8 * 60 * 60 * 1000
    })).toEqual({
      upload: 10 * 60 * 1000,
      poll: 15 * 1000,
      idle: 45 * 60 * 1000,
      absolute: 8 * 60 * 60 * 1000
    })
  })

  it('keeps safe lower bounds for invalid values', () => {
    const timeouts = resolveAsrTimeouts({
      baseUrl: 'http://asr.test',
      uploadTimeoutMs: 0,
      pollTimeoutMs: 0,
      jobIdleTimeoutMs: 0,
      jobAbsoluteTimeoutMs: 0
    })
    expect(timeouts.upload).toBeGreaterThanOrEqual(60_000)
    expect(timeouts.poll).toBeGreaterThanOrEqual(1_000)
    expect(timeouts.idle).toBeGreaterThanOrEqual(60_000)
    expect(timeouts.absolute).toBeGreaterThanOrEqual(10 * 60 * 1000)
  })

  it('classifies ASR timeout errors with actionable guidance', () => {
    expect(classifyTaskError('ASR 长时间没有进度（30 分钟），已取消远端任务').type).toBe('timeout')
    expect(classifyTaskError('ASR 任务超过最长执行时间（360 分钟），已取消远端任务').summary).toContain('ASR_JOB_IDLE_TIMEOUT_MS')
    expect(classifyTaskError('ASR 音频上传超时（30 分钟）').type).toBe('timeout')
  })
})
