import { describe, expect, it } from 'vitest'
import { mergeAsrHealth } from '../asr/status'

describe('mergeAsrHealth', () => {
  it('reports the configured model instead of the service default', () => {
    const merged = mergeAsrHealth(
      { asrModel: 'large-v3', asrDevice: 'auto', asrComputeType: 'float16' },
      { engine: 'faster-whisper', model: 'small', device: 'cpu', computeType: 'int8' }
    )

    expect(merged).toMatchObject({
      engine: 'faster-whisper',
      serviceEngine: 'faster-whisper',
      model: 'large-v3',
      serviceModel: 'small',
      device: 'cpu',
      computeType: 'float16'
    })
  })

  it('reports an explicitly configured engine instead of the service default', () => {
    const merged = mergeAsrHealth(
      { asrModel: 'large-v3', asrDevice: 'auto', asrComputeType: 'float16', asrEngine: 'whisper-cpp' },
      { engine: 'faster-whisper', model: 'small', device: 'cpu', computeType: 'int8' }
    )

    expect(merged).toMatchObject({
      engine: 'whisper-cpp',
      serviceEngine: 'faster-whisper'
    })
  })

  it('keeps the resolved device when the configuration uses auto', () => {
    const merged = mergeAsrHealth(
      { asrModel: 'medium', asrDevice: 'auto', asrComputeType: 'int8' },
      { model: 'small', device: 'cuda', computeType: 'float16' }
    )

    expect(merged).toMatchObject({ model: 'medium', device: 'cuda', computeType: 'int8' })
  })

  it('returns non-object health payloads unchanged', () => {
    expect(mergeAsrHealth({ asrModel: 'small', asrDevice: 'auto', asrComputeType: 'int8' }, null)).toBeNull()
    expect(mergeAsrHealth({ asrModel: 'small', asrDevice: 'auto', asrComputeType: 'int8' }, 'bad gateway')).toBe('bad gateway')
  })
})
