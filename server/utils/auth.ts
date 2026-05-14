import { createHash, randomBytes } from 'crypto'
import { useDb } from './db'

const loginAttempts = new Map<string, { count: number; lastAttempt: number }>()
const MAX_LOGIN_ATTEMPTS = 5
const LOGIN_WINDOW_MS = 60 * 1000

function checkLoginRateLimit(ip: string): boolean {
    const now = Date.now()
    const record = loginAttempts.get(ip)

    if (!record || now - record.lastAttempt > LOGIN_WINDOW_MS) {
        loginAttempts.set(ip, { count: 1, lastAttempt: now })
        return true
    }

    if (record.count >= MAX_LOGIN_ATTEMPTS) {
        return false
    }

    record.count++
    record.lastAttempt = now
    return true
}

export const AuthService = {
    hasPasskey(): boolean {
        const db = useDb()
        const row = db.prepare('SELECT id FROM auth WHERE id = 1').get()
        return !!row
    },

    setupPasskey(passkey: string): void {
        if (this.hasPasskey()) {
            throw new Error('口令密钥已存在，不可重复创建')
        }
        const hash = this.hashPasskey(passkey)
        const db = useDb()
        db.prepare('INSERT INTO auth (id, passkey_hash) VALUES (1, ?)').run(hash)
    },

    verifyPasskey(passkey: string): boolean {
        const db = useDb()
        const row = db.prepare('SELECT passkey_hash FROM auth WHERE id = 1').get() as any
        if (!row) return false
        return row.passkey_hash === this.hashPasskey(passkey)
    },

    checkLoginRate(ip: string): boolean {
        return checkLoginRateLimit(ip)
    },

    createSession(): string {
        const token = randomBytes(32).toString('hex')
        const db = useDb()
        db.prepare("DELETE FROM sessions WHERE expires_at < datetime('now')").run()
        db.prepare("INSERT INTO sessions (token, expires_at) VALUES (?, datetime('now', '+7 days'))").run(token)
        return token
    },

    verifySession(token: string): boolean {
        if (!token) return false
        const db = useDb()
        const row = db.prepare("SELECT token FROM sessions WHERE token = ? AND expires_at > datetime('now')").get(token) as any
        return !!row
    },

    destroySession(token: string): void {
        const db = useDb()
        db.prepare('DELETE FROM sessions WHERE token = ?').run(token)
    },

    hashPasskey(passkey: string): string {
        return createHash('sha256').update(passkey).digest('hex')
    }
}
