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

  it('classifies missing local models with an actionable summary', () => {
    const downloaded = classifyTaskError('ASR 任务失败：模型未下载')
    expect(downloaded.type).toBe('model')
    expect(downloaded.summary).toContain('本地模型管理')
    expect(classifyTaskError('模型尚未下载，请先下载模型').type).toBe('model')
    expect(classifyTaskError('model not downloaded').type).toBe('model')
  })

  it('classifies invalid ASR and OCR API keys as auth failures', () => {
    expect(classifyTaskError('ASR API key 无效').type).toBe('auth')
    expect(classifyTaskError('OCR API key 无效').type).toBe('auth')
  })

  it('classifies undici client compatibility failures', () => {
    const error = classifyTaskError('ASR 任务创建失败：UND_ERR_INVALID_ARG')
    expect(error.type).toBe('network')
    expect(error.summary).toContain('undici')
  })

  it('falls back to unknown', () => {
    expect(classifyTaskError('something unexpected').type).toBe('unknown')
  })
})
