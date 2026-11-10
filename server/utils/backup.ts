import Database from 'better-sqlite3'
import { chmodSync, copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'fs'
import { dirname, join, resolve } from 'path'
import { useDb } from './db'
import { ConfigService } from './config'
import { logger } from './logger'

const MAX_KEEP = 100
let autoBackupRunning = false
let postgresWarningLogged = false
const globalState = globalThis as any

export interface BackupInfo {
  name: string
  path: string
  createdAt: string
  schemaVersion: number
  sizeBytes: number
  includesSecret: boolean
  includesLogs: boolean
}

function dbPath() {
  return resolve(process.env.DB_PATH || join(process.cwd(), 'db', 'subx.db'))
}

export function backupRoot() {
  return resolve(process.env.SUBX_BACKUP_DIR || join(process.cwd(), 'backups'))
}

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-')
}

function readManifest(dir: string): any {
  try { return JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf-8')) } catch { return {} }
}

function directorySize(dir: string): number {
  let total = 0
  try {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name)
      try {
        if (entry.isDirectory()) total += directorySize(full)
        else if (entry.isFile()) total += statSync(full).size
      } catch { /* ignore unreadable entries */ }
    }
  } catch { /* ignore */ }
  return total
}

function pruneBackups(root: string, keep: number) {
  const limit = Math.max(1, Math.min(MAX_KEEP, Math.floor(keep) || 10))
  try {
    const entries = readdirSync(root, { withFileTypes: true })
      .filter(entry => entry.isDirectory() && entry.name.startsWith('subx-'))
      .map(entry => entry.name)
      .sort()
      .reverse()
    for (const name of entries.slice(limit)) {
      rmSync(join(root, name), { recursive: true, force: true })
    }
  } catch { /* retention is best effort */ }
}

export const BackupService = {
  list(): BackupInfo[] {
    const root = backupRoot()
    if (!existsSync(root)) return []
    try {
      return readdirSync(root, { withFileTypes: true })
        .filter(entry => entry.isDirectory() && entry.name.startsWith('subx-'))
        .map(entry => {
          const path = join(root, entry.name)
          const manifest = readManifest(path)
          return {
            name: entry.name,
            path,
            createdAt: String(manifest.createdAt || statSync(path).mtime.toISOString()),
            schemaVersion: Number(manifest.schemaVersion || 0),
            sizeBytes: directorySize(path),
            includesSecret: manifest.includesSecret === true,
            includesLogs: manifest.includesLogs === true
          }
        })
        .sort((a, b) => b.name.localeCompare(a.name))
    } catch {
      return []
    }
  },

  async create(options: { keep?: number, includeLogs?: boolean } = {}): Promise<BackupInfo> {
    const db = useDb() as any
    if (typeof db.backup !== 'function') {
      throw new Error('当前数据库模式不支持应用内备份，请使用 PostgreSQL 的 pg_dump')
    }

    const sourceDb = dbPath()
    if (!existsSync(sourceDb)) throw new Error(`数据库不存在：${sourceDb}`)
    const root = backupRoot()
    const keep = Math.max(1, Math.min(MAX_KEEP, Math.floor(Number(options.keep) || 10)))
    const name = `subx-${timestamp()}`
    const target = join(root, name)
    mkdirSync(target, { recursive: true, mode: 0o700 })
    try { chmodSync(target, 0o700) } catch { /* best effort */ }

    const targetDb = join(target, 'subx.db')
    await db.backup(targetDb)
    try { chmodSync(targetDb, 0o600) } catch { /* best effort */ }

    let schemaVersion = 0
    const verify = new Database(targetDb, { readonly: true })
    try {
      const schemaRow = verify.prepare('SELECT MAX(version) AS version FROM schema_migrations').get() as any
      schemaVersion = Number(schemaRow?.version || 0)
    } finally {
      verify.close()
    }

    const secretPath = join(dirname(sourceDb), '.secret')
    const includeSecret = existsSync(secretPath)
    if (includeSecret) {
      copyFileSync(secretPath, join(target, '.secret'))
      try { chmodSync(join(target, '.secret'), 0o600) } catch { /* best effort */ }
    }

    const includeLogs = options.includeLogs === true
    if (includeLogs && existsSync(join(dirname(sourceDb), 'logs'))) {
      const { cpSync } = await import('fs')
      cpSync(join(dirname(sourceDb), 'logs'), join(target, 'logs'), { recursive: true })
    }

    const manifest = {
      createdAt: new Date().toISOString(),
      schemaVersion,
      sourceDb,
      includesSecret: includeSecret,
      includesLogs: includeLogs,
      source: 'app'
    }
    const manifestPath = join(target, 'manifest.json')
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8')
    try { chmodSync(manifestPath, 0o600) } catch { /* best effort */ }

    pruneBackups(root, keep)
    return {
      name,
      path: target,
      createdAt: manifest.createdAt,
      schemaVersion,
      sizeBytes: directorySize(target),
      includesSecret: includeSecret,
      includesLogs: includeLogs
    }
  },

  async autoBackupIfDue() {
    if (autoBackupRunning) return
    const config = await ConfigService.getConfig()
    if (config.autoBackupEnabled !== true) return
    const intervalMs = Math.max(1, Number(config.autoBackupIntervalHours || 24)) * 60 * 60 * 1000
    const backups = this.list()
    if (backups.length > 0) {
      const latest = backups[0]!
      const latestAt = new Date(latest.createdAt).getTime()
      if (Number.isFinite(latestAt) && Date.now() - latestAt < intervalMs) return
    }

    autoBackupRunning = true
    try {
      const created = await this.create({ keep: Number(config.autoBackupKeep || 10) })
      logger.info({ path: created.path, schemaVersion: created.schemaVersion }, 'automatic backup created')
    } catch (error: any) {
      if (String(error?.message || '').includes('不支持应用内备份')) {
        if (!postgresWarningLogged) {
          postgresWarningLogged = true
          logger.warn('automatic backup skipped: PostgreSQL requires pg_dump')
        }
      } else {
        logger.error({ err: { message: String(error?.message || error) } }, 'automatic backup failed')
      }
    } finally {
      autoBackupRunning = false
    }
  }
}

export function startAutoBackupScheduler() {
  if (globalState.__subxAutoBackupTimer) return
  const check = () => { void BackupService.autoBackupIfDue() }
  check()
  globalState.__subxAutoBackupTimer = setInterval(check, 6 * 60 * 60 * 1000)
  globalState.__subxAutoBackupTimer.unref?.()
}
