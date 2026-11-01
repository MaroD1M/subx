import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'

const ENCRYPTION_PREFIX = 'enc:v1:'
const ALGORITHM = 'aes-256-gcm'
const KEY_BYTES = 32

let cachedKey: Buffer | null = null

function dbDir() {
  const dbPath = process.env.DB_PATH || join(process.cwd(), 'db', 'subx.db')
  return dirname(dbPath)
}

function normalizeKeyMaterial(value: string): Buffer {
  const trimmed = value.trim()
  if (/^[0-9a-f]{64}$/i.test(trimmed)) return Buffer.from(trimmed, 'hex')
  const base64 = Buffer.from(trimmed, 'base64')
  if (base64.length === KEY_BYTES) return base64
  return createHash('sha256').update(trimmed).digest()
}

function loadMasterKey(): Buffer {
  if (cachedKey) return cachedKey

  const envKey = process.env.SUBX_SECRET_KEY
  if (envKey && envKey.trim()) {
    cachedKey = normalizeKeyMaterial(envKey)
    return cachedKey
  }

  const keyPath = join(dbDir(), '.secret')
  if (existsSync(keyPath)) {
    cachedKey = normalizeKeyMaterial(readFileSync(keyPath, 'utf-8'))
    return cachedKey
  }

  const dir = dirname(keyPath)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  const generated = randomBytes(KEY_BYTES).toString('hex')
  writeFileSync(keyPath, generated, { encoding: 'utf-8', mode: 0o600 })
  cachedKey = Buffer.from(generated, 'hex')
  return cachedKey
}

export function isEncryptedSecret(value: unknown): boolean {
  return typeof value === 'string' && value.startsWith(ENCRYPTION_PREFIX)
}

export function encryptSecret(plaintext: string): string {
  if (!plaintext) return ''
  if (isEncryptedSecret(plaintext)) return plaintext

  const key = loadMasterKey()
  const iv = randomBytes(12)
  const cipher = createCipheriv(ALGORITHM, key, iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf-8'), cipher.final()])
  const tag = cipher.getAuthTag()

  return `${ENCRYPTION_PREFIX}${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('base64')}`
}

export function decryptSecret(value: string): string {
  if (!value) return ''
  if (!isEncryptedSecret(value)) return value

  const payload = value.slice(ENCRYPTION_PREFIX.length)
  const [ivHex, tagHex, ciphertext] = payload.split(':')
  if (!ivHex || !tagHex || !ciphertext) {
    throw new Error('加密凭据格式不合法')
  }

  const key = loadMasterKey()
  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(ivHex, 'hex'))
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'))
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(ciphertext, 'base64')),
    decipher.final()
  ])
  return decrypted.toString('utf-8')
}

export function resetSecretKeyCache() {
  cachedKey = null
}
