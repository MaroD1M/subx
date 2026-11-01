import { describe, expect, it } from 'vitest'
import { hashApiToken, isValidApiTokenFormat, resolveApiTokenScope } from '../apiTokens'

describe('API tokens', () => {
  it('hashes tokens deterministically without storing plaintext', () => {
    const token = `subx_${'a'.repeat(48)}`
    expect(hashApiToken(token)).toHaveLength(64)
    expect(hashApiToken(token)).toBe(hashApiToken(token))
    expect(hashApiToken(token)).not.toContain(token)
  })

  it('validates generated token format', () => {
    expect(isValidApiTokenFormat(`subx_${'a'.repeat(48)}`)).toBe(true)
    expect(isValidApiTokenFormat(`subx_${'a'.repeat(47)}`)).toBe(false)
    expect(isValidApiTokenFormat('Bearer abc')).toBe(false)
  })

  it('maps task endpoints to read/write scopes', () => {
    expect(resolveApiTokenScope('GET', '/api/tasks')).toBe('tasks:read')
    expect(resolveApiTokenScope('GET', '/api/tasks/abc')).toBe('tasks:read')
    expect(resolveApiTokenScope('POST', '/api/task')).toBe('tasks:write')
    expect(resolveApiTokenScope('POST', '/api/tasks/abc/cancel')).toBe('tasks:write')
    expect(resolveApiTokenScope('GET', '/api/tasks/abc/download')).toBe('tasks:read')
  })

  it('maps automation and token endpoints to their scopes', () => {
    expect(resolveApiTokenScope('GET', '/api/watch-folders')).toBe('automation:read')
    expect(resolveApiTokenScope('POST', '/api/watch-folders')).toBe('automation:write')
    expect(resolveApiTokenScope('POST', '/api/notification-channels/1/test')).toBe('automation:write')
    expect(resolveApiTokenScope('GET', '/api/api-tokens')).toBe('tokens:manage')
    expect(resolveApiTokenScope('GET', '/api/config')).toBe('system:admin')
  })

  it('protects ASR model management with admin scope', () => {
    expect(resolveApiTokenScope('GET', '/api/asr/models')).toBe('tasks:read')
    expect(resolveApiTokenScope('GET', '/api/asr/models-download-status')).toBe('tasks:read')
    expect(resolveApiTokenScope('POST', '/api/asr/models-download')).toBe('system:admin')
    expect(resolveApiTokenScope('POST', '/api/asr/models-download-pause')).toBe('system:admin')
    expect(resolveApiTokenScope('POST', '/api/asr/models-delete')).toBe('system:admin')
  })

  it('keeps health and OpenAPI public', () => {
    expect(resolveApiTokenScope('GET', '/api/health')).toBe('public')
    expect(resolveApiTokenScope('GET', '/api/openapi.json')).toBe('public')
    expect(resolveApiTokenScope('POST', '/api/auth/login')).toBe('public')
  })
})
