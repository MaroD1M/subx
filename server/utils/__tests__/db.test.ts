import { afterEach, describe, expect, it } from 'vitest'
import Database from 'better-sqlite3'
import { mkdtempSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { applySqlitePragmas } from '../db'

let workDir = ''
let db: Database.Database | null = null

afterEach(() => {
  db?.close()
  db = null
  if (workDir) {
    rmSync(workDir, { recursive: true, force: true })
    workDir = ''
  }
})

describe('applySqlitePragmas', () => {
  it('sets local performance pragmas and keeps WAL enabled', () => {
    workDir = mkdtempSync(join(tmpdir(), 'subx-db-'))
    db = new Database(join(workDir, 'subx.db'))

    applySqlitePragmas(db)

    expect(db.pragma('journal_mode', { simple: true })).toBe('wal')
    expect(db.pragma('busy_timeout', { simple: true })).toBe(5000)
    expect(db.pragma('synchronous', { simple: true })).toBe(1)
    expect(db.pragma('temp_store', { simple: true })).toBe(2)
    expect(db.pragma('cache_size', { simple: true })).toBe(-32000)
  })
})
