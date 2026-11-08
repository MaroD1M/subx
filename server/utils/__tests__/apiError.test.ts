import { beforeAll, describe, expect, it, vi } from 'vitest'

let apiError: typeof import('../apiError').apiError
let normalizeApiError: typeof import('../apiError').normalizeApiError

beforeAll(async () => {
  vi.stubGlobal('createError', (options: any) => Object.assign(new Error(options?.message || ''), options))
  const mod = await import('../apiError')
  apiError = mod.apiError
  normalizeApiError = mod.normalizeApiError
})

describe('api errors', () => {
  it('creates a normalized HTTP error', () => {
    const error: any = apiError(404, 'not found', { resource: 'task' })
    expect(error.statusCode).toBe(404)
    expect(error.statusMessage).toBe('not found')
    expect(error.message).toBe('not found')
    expect(error.data).toEqual({ resource: 'task' })
  })

  it('keeps existing HTTP errors and wraps plain errors', () => {
    const original: any = { statusCode: 401, message: 'unauthorized' }
    expect(normalizeApiError(original)).toBe(original)

    const wrapped: any = normalizeApiError(new Error('boom'), 'fallback', 502)
    expect(wrapped.statusCode).toBe(502)
    expect(wrapped.message).toBe('boom')
  })
})
