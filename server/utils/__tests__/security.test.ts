import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, symlinkSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { decryptSecret, encryptSecret, resetSecretKeyCache } from '../secret'
import { resolveInsideRoot, resolvePathEntry } from '../pathSafety'

describe('secret encryption', () => {
  beforeEach(() => {
    process.env.SUBX_SECRET_KEY = 'unit-test-secret-key'
    resetSecretKeyCache()
  })

  afterEach(() => {
    delete process.env.SUBX_SECRET_KEY
    resetSecretKeyCache()
  })

  it('encrypts and decrypts API keys without storing plaintext', () => {
    const encrypted = encryptSecret('sk-test-123456')
    expect(encrypted.startsWith('enc:v1:')).toBe(true)
    expect(encrypted).not.toContain('sk-test-123456')
    expect(decryptSecret(encrypted)).toBe('sk-test-123456')
  })

  it('keeps legacy plaintext values readable', () => {
    expect(decryptSecret('legacy-key')).toBe('legacy-key')
  })
})

describe('path safety', () => {
  it('blocks traversal and symlink escapes', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'subx-path-'))
    const root = join(dir, 'root')
    const outside = join(dir, 'outside')
    const fs = await import('fs')
    fs.mkdirSync(root)
    fs.mkdirSync(outside)
    writeFileSync(join(root, 'inside.txt'), 'ok')
    writeFileSync(join(outside, 'secret.txt'), 'secret')
    symlinkSync(outside, join(root, 'link'))

    await expect(resolveInsideRoot(root, 'inside.txt')).resolves.toContain('inside.txt')
    await expect(resolveInsideRoot(root, '../outside/secret.txt')).rejects.toMatchObject({ statusCode: 403 })
    await expect(resolveInsideRoot(root, 'link/secret.txt')).rejects.toMatchObject({ statusCode: 403 })
    await expect(resolvePathEntry(root, 'link')).resolves.toContain('link')

    rmSync(dir, { recursive: true, force: true })
  })
})
