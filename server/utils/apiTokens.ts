import { createHash, randomBytes } from 'crypto'
import type { H3Event } from 'h3'
import type { ApiTokenSummary } from '../../types'
import { useDb } from './db'

export const API_TOKEN_SCOPES = [
  'tasks:read',
  'tasks:write',
  'automation:read',
  'automation:write',
  'tokens:manage',
  'system:admin'
] as const

export type ApiTokenScope = typeof API_TOKEN_SCOPES[number] | '*'

export interface ApiAuthContext {
  type: 'session' | 'token'
  tokenId?: number
  name?: string
  scopes: string[]
}

export function hashApiToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export function isValidApiTokenFormat(token: string): boolean {
  return /^subx_[a-f0-9]{48}$/.test(String(token || ''))
}

function sanitizeScopes(input: unknown): ApiTokenScope[] {
  const values = Array.isArray(input) ? input.map(String) : []
  const scopes = values.filter((scope): scope is ApiTokenScope => scope === '*' || API_TOKEN_SCOPES.includes(scope as any))
  return scopes.length ? Array.from(new Set(scopes)) : ['tasks:read']
}

function normalizeExpiry(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null
  if (typeof value === 'number' && Number.isFinite(value)) {
    const days = Math.max(1, Math.min(3650, Math.floor(value)))
    return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString()
  }
  const time = Date.parse(String(value))
  if (!Number.isFinite(time)) throw new Error('Token 过期时间不合法')
  if (time <= Date.now()) throw new Error('Token 过期时间必须晚于当前时间')
  return new Date(time).toISOString()
}

export const ApiTokenService = {
  list(): ApiTokenSummary[] {
    const rows = useDb().prepare(`
      SELECT id, name, prefix, scopes_json, expires_at, last_used_at, created_at, revoked_at
      FROM api_tokens
      ORDER BY id DESC
    `).all() as any[]
    return rows.map(row => ({
      id: Number(row.id),
      name: String(row.name),
      prefix: String(row.prefix),
      scopes: JSON.parse(row.scopes_json || '[]'),
      expiresAt: row.expires_at || null,
      lastUsedAt: row.last_used_at || null,
      createdAt: row.created_at,
      revokedAt: row.revoked_at || null
    }))
  },

  create(input: { name?: unknown, scopes?: unknown, expiresInDays?: unknown, expiresAt?: unknown }) {
    const name = String(input.name || '').trim()
    if (!name) throw new Error('Token 名称不能为空')
    const scopes = sanitizeScopes(input.scopes)
    const expiresAt = normalizeExpiry(input.expiresInDays ?? input.expiresAt)
    const token = `subx_${randomBytes(24).toString('hex')}`
    const db = useDb()
    const info = db.prepare(`
      INSERT INTO api_tokens (name, token_hash, prefix, scopes_json, expires_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(name.substring(0, 80), hashApiToken(token), token.slice(0, 12), JSON.stringify(scopes), expiresAt)
    return {
      token,
      item: this.list().find(item => item.id === Number(info.lastInsertRowid))
    }
  },

  revoke(id: number) {
    return useDb().prepare("UPDATE api_tokens SET revoked_at = datetime('now') WHERE id = ? AND revoked_at IS NULL").run(id).changes > 0
  },

  recordAudit(auth: ApiAuthContext, method: string, pathname: string, statusCode: number, ip?: string) {
    if (auth.type !== 'token') return
    try {
      useDb().prepare(`
        INSERT INTO api_audit_logs (token_id, token_name, method, path, status_code, ip)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(auth.tokenId || null, auth.name || '', String(method || 'GET'), String(pathname), Number(statusCode) || 0, ip || '')
    } catch { /* best effort */ }
  },

  listAudit(limit = 100) {
    const rows = useDb().prepare(`
      SELECT id, token_id, token_name, method, path, status_code, ip, created_at
      FROM api_audit_logs ORDER BY created_at DESC, id DESC LIMIT ?
    `).all(Math.min(500, Math.max(1, Number(limit) || 100))) as any[]
    return rows.map(row => ({
      id: Number(row.id),
      tokenId: row.token_id ? Number(row.token_id) : null,
      tokenName: String(row.token_name || ''),
      method: String(row.method),
      path: String(row.path),
      statusCode: Number(row.status_code || 0),
      ip: String(row.ip || ''),
      createdAt: row.created_at
    }))
  },

  verify(token: string): ApiAuthContext | null {
    if (!isValidApiTokenFormat(token)) return null
    const db = useDb()
    const row = db.prepare(`
      SELECT id, name, scopes_json
      FROM api_tokens
      WHERE token_hash = ? AND revoked_at IS NULL
        AND (expires_at IS NULL OR expires_at > datetime('now'))
    `).get(hashApiToken(token)) as any
    if (!row) return null
    try {
      db.prepare("UPDATE api_tokens SET last_used_at = datetime('now') WHERE id = ?").run(row.id)
    } catch { /* best effort */ }
    return {
      type: 'token',
      tokenId: Number(row.id),
      name: String(row.name),
      scopes: JSON.parse(row.scopes_json || '[]')
    }
  }
}

export function getAuthContext(event: H3Event): ApiAuthContext | null {
  return (event.context.auth as ApiAuthContext | undefined) || null
}

export function requireScope(event: H3Event, scope: string) {
  const auth = getAuthContext(event)
  if (!auth) throw createError({ statusCode: 401, message: '未授权' })
  if (auth.type === 'session') return
  if (auth.scopes.includes('*') || auth.scopes.includes(scope)) return
  throw createError({ statusCode: 403, message: `API Token 缺少权限：${scope}` })
}

export function resolveApiTokenScope(method: string, pathname: string): string | null {
  const path = pathname.replace(/\/+$/, '') || '/'
  const verb = String(method || 'GET').toUpperCase()
  if (path === '/api/health' || path === '/api/openapi.json') return 'public'
  if (path.startsWith('/api/auth/')) return 'public'

  if (path === '/api/task' || path.startsWith('/api/tasks') || path.startsWith('/api/task/')) {
    if (path.endsWith('/download') || path.endsWith('/download-original')) return 'tasks:read'
    if (verb === 'GET' || verb === 'HEAD') return 'tasks:read'
    return 'tasks:write'
  }
  if (path.startsWith('/api/watch-') || path.startsWith('/api/notification-') || path.startsWith('/api/integrations/')) {
    return verb === 'GET' || verb === 'HEAD' ? 'automation:read' : 'automation:write'
  }
  if (path.startsWith('/api/api-tokens') || path === '/api/api-token-audit') return 'tokens:manage'
  if (path.startsWith('/api/sse/') || path === '/api/tracks' || path === '/api/subtitle-content') return 'tasks:read'
  if (path.startsWith('/api/asr/models')) {
    return verb === 'GET' || verb === 'HEAD' ? 'tasks:read' : 'system:admin'
  }
  if (path.startsWith('/api/asr/')) return 'tasks:read'
  if (path === '/api/config' || path.startsWith('/api/config/')) return 'system:admin'
  return 'system:admin'
}
