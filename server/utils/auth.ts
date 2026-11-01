import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'crypto'
import { useDb } from './db'

const loginAttempts = new Map<string, { count: number; lastAttempt: number }>()
const MAX_LOGIN_ATTEMPTS = 5
const LOGIN_WINDOW_MS = 60 * 1000
const SCRYPT_N = 16384
const SCRYPT_R = 8
const SCRYPT_P = 1
const SCRYPT_KEYLEN = 64

function cleanupLoginAttempts() {
    const now = Date.now()
    for (const [ip, record] of loginAttempts.entries()) {
        if (now - record.lastAttempt > LOGIN_WINDOW_MS) {
            loginAttempts.delete(ip)
        }
    }
}

function checkLoginRateLimit(ip: string): boolean {
    cleanupLoginAttempts()
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

function hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex')
}

function safeEqualHex(left: string, right: string): boolean {
    if (!/^[0-9a-f]+$/i.test(left) || !/^[0-9a-f]+$/i.test(right)) return false
    const leftBuffer = Buffer.from(left, 'hex')
    const rightBuffer = Buffer.from(right, 'hex')
    if (leftBuffer.length !== rightBuffer.length) return false
    return timingSafeEqual(leftBuffer, rightBuffer)
}

function hashPasskeyScrypt(passkey: string): string {
    const salt = randomBytes(16)
    const derived = scryptSync(passkey, salt, SCRYPT_KEYLEN, { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P })
    return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt.toString('hex')}$${derived.toString('hex')}`
}

function verifyPasskeyScrypt(passkey: string, stored: string): boolean {
    const parts = stored.split('$')
    if (parts.length !== 6 || parts[0] !== 'scrypt') return false
    const [, nRaw, rRaw, pRaw, saltHex, hashHex] = parts
    const N = Number(nRaw)
    const r = Number(rRaw)
    const p = Number(pRaw)
    if (!Number.isFinite(N) || !Number.isFinite(r) || !Number.isFinite(p) || !saltHex || !hashHex) return false

    try {
        const derived = scryptSync(passkey, Buffer.from(saltHex, 'hex'), Buffer.from(hashHex, 'hex').length, { N, r, p })
        return safeEqualHex(derived.toString('hex'), hashHex)
    } catch {
        return false
    }
}

function legacyHash(passkey: string): string {
    return createHash('sha256').update(passkey).digest('hex')
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

        const stored = String(row.passkey_hash || '')
        if (stored.startsWith('scrypt$')) {
            return verifyPasskeyScrypt(passkey, stored)
        }

        const validLegacy = safeEqualHex(legacyHash(passkey), stored)
        if (validLegacy) {
            try {
                db.prepare('UPDATE auth SET passkey_hash = ? WHERE id = 1').run(hashPasskeyScrypt(passkey))
            } catch {
                // 升级失败不影响本次登录
            }
        }
        return validLegacy
    },

    checkLoginRate(ip: string): boolean {
        return checkLoginRateLimit(ip)
    },

    createSession(): string {
        const token = randomBytes(32).toString('hex')
        const db = useDb()
        db.prepare("DELETE FROM sessions WHERE expires_at < datetime('now')").run()
        db.prepare("INSERT INTO sessions (token, expires_at) VALUES (?, datetime('now', '+7 days'))").run(hashToken(token))
        return token
    },

    verifySession(token: string): boolean {
        if (!token) return false
        const db = useDb()
        const row = db.prepare("SELECT token FROM sessions WHERE token = ? AND expires_at > datetime('now')").get(hashToken(token)) as any
        return !!row
    },

    destroySession(token: string): void {
        const db = useDb()
        db.prepare('DELETE FROM sessions WHERE token = ?').run(hashToken(token))
    },

    hashPasskey(passkey: string): string {
        return hashPasskeyScrypt(passkey)
    }
}
