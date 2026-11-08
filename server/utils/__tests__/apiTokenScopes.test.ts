import { beforeEach, describe, expect, it, vi } from 'vitest'

const rows: any[] = []
const mockDb = {
  prepare(sql: string) {
    return {
      run: (...args: any[]) => {
        if (sql.includes('INSERT INTO api_tokens')) {
          rows.push({ id: rows.length + 1, name: args[0], scopes_json: args[3], created_at: '2026-01-01 00:00:00' })
          return { lastInsertRowid: rows.length }
        }
        return { changes: 1 }
      },
      get: () => undefined,
      all: () => rows.slice().reverse()
    }
  }
}

vi.mock('../db', () => ({ useDb: () => mockDb }))

const { ApiTokenService } = await import('../apiTokens')

beforeEach(() => {
  rows.length = 0
})

describe('API token scope delegation', () => {
  it('rejects scopes above the current token permissions', () => {
    expect(() => ApiTokenService.create(
      { name: 'escalated', scopes: ['*'] },
      { type: 'token', scopes: ['tasks:read', 'tokens:manage'] }
    )).toThrow('不能授予超出当前 Token 权限')
  })

  it('allows session callers to grant full access', () => {
    const result = ApiTokenService.create({ name: 'full', scopes: ['*'] }, { type: 'session', scopes: ['*'] })
    expect(result.item?.scopes).toEqual(['*'])
  })

  it('allows a token to grant its own subset', () => {
    const result = ApiTokenService.create(
      { name: 'subset', scopes: ['tasks:read'] },
      { type: 'token', scopes: ['tasks:read', 'tokens:manage'] }
    )
    expect(result.item?.scopes).toEqual(['tasks:read'])
  })
})
