import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createHash } from 'crypto'

const state: { authHash: string | null, sessions: Set<string> } = { authHash: null, sessions: new Set() }

const mockDb = {
  prepare(sql: string) {
    return {
      get(...args: any[]) {
        if (sql.includes('SELECT id FROM auth')) return state.authHash ? { id: 1 } : undefined
        if (sql.includes('SELECT passkey_hash')) return state.authHash ? { passkey_hash: state.authHash } : undefined
        if (sql.includes('SELECT token FROM sessions')) return state.sessions.has(String(args[0])) ? { token: args[0] } : undefined
        return undefined
      },
      run(...args: any[]) {
        if (sql.includes('INSERT INTO auth')) state.authHash = String(args[0])
        if (sql.includes('UPDATE auth SET passkey_hash')) state.authHash = String(args[0])
        if (sql.includes('INSERT INTO sessions')) state.sessions.add(String(args[0]))
        if (sql.includes('DELETE FROM sessions WHERE token')) state.sessions.delete(String(args[0]))
        return { changes: 1 }
      }
    }
  }
}

vi.mock('../db', () => ({ useDb: () => mockDb }))

describe('AuthService', () => {
  beforeEach(() => {
    state.authHash = null
    state.sessions.clear()
    vi.resetModules()
  })

  it('stores scrypt hashes and verifies passkeys', async () => {
    const { AuthService } = await import('../auth')
    AuthService.setupPasskey('client-hash')
    expect(state.authHash?.startsWith('scrypt$')).toBe(true)
    expect(AuthService.verifyPasskey('client-hash')).toBe(true)
    expect(AuthService.verifyPasskey('wrong')).toBe(false)
  })

  it('upgrades legacy sha256 hashes on successful login', async () => {
    const { AuthService } = await import('../auth')
    state.authHash = createHash('sha256').update('legacy-client-hash').digest('hex')
    expect(AuthService.verifyPasskey('legacy-client-hash')).toBe(true)
    expect(state.authHash?.startsWith('scrypt$')).toBe(true)
  })

  it('stores only session token hashes', async () => {
    const { AuthService } = await import('../auth')
    const token = AuthService.createSession()
    expect(state.sessions.has(token)).toBe(false)
    expect(state.sessions.has(createHash('sha256').update(token).digest('hex'))).toBe(true)
    expect(AuthService.verifySession(token)).toBe(true)
    AuthService.destroySession(token)
    expect(AuthService.verifySession(token)).toBe(false)
  })
})
