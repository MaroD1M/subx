import { describe, expect, it } from 'vitest'
import { classifyTaskError } from '../taskError'

describe('classifyTaskError', () => {
  it('classifies authentication and rate limit failures', () => {
    expect(classifyTaskError('401 Unauthorized: invalid api key').type).toBe('auth')
    expect(classifyTaskError('429 rate limit exceeded').type).toBe('rate_limit')
  })

  it('classifies model and provider failures', () => {
    expect(classifyTaskError('model gpt-x not found').type).toBe('model')
    expect(classifyTaskError('upstream returned 503').type).toBe('provider')
  })

  it('classifies ASR and OCR timeout limits', () => {
    expect(classifyTaskError('ASR 任务长时间没有进度').type).toBe('timeout')
    expect(classifyTaskError('视频时长超过 OCR 最大处理时长').type).toBe('ocr_limit')
    expect(classifyTaskError('OCR 任务超时：长时间没有进度').type).toBe('ocr_timeout')
  })

  it('classifies network and content failures', () => {
    expect(classifyTaskError('fetch failed ECONNRESET').type).toBe('network')
    expect(classifyTaskError('[解析为空] 返回格式不完整').type).toBe('parse')
    expect(classifyTaskError('[疑似拒答] 无法翻译').type).toBe('content')
  })

  it('falls back to unknown', () => {
    expect(classifyTaskError('something unexpected').type).toBe('unknown')
  })
})
