import Database from 'better-sqlite3'
import { chmodSync, copyFileSync, existsSync, readFileSync, rmSync } from 'fs'
import { dirname, join, resolve } from 'path'

const source = resolve(String(process.argv[2] || ''))
const dbPath = resolve(process.env.DB_PATH || 'db/subx.db')
const force = process.argv.includes('--force')

function readCodeSchemaVersion() {
  try {
    const source = readFileSync(new URL('../server/utils/migrations.ts', import.meta.url), 'utf-8')
    const versions = [...source.matchAll(/version:\s*(\d+)/g)].map(match => Number(match[1]))
    return versions.length ? Math.max(...versions) : 0
  } catch {
    return 0
  }
}

function readDbSchemaVersion(filePath) {
  const db = new Database(filePath, { readonly: true })
  try {
    const row = db.prepare('SELECT MAX(version) AS version FROM schema_migrations').get()
    return Number(row?.version || 0)
  } finally {
    db.close()
  }
}

if (!source || !existsSync(join(source, 'subx.db'))) {
  console.error('用法：node scripts/restore-sqlite.mjs <备份目录>')
  process.exit(1)
}

const backupDb = join(source, 'subx.db')
let backupVersion = 0
let currentVersion = 0
const verify = new Database(backupDb, { readonly: true })
try {
  const integrity = verify.pragma('integrity_check', { simple: true })
  if (String(integrity) !== 'ok') throw new Error(`备份数据库完整性检查失败：${integrity}`)
  const row = verify.prepare('SELECT MAX(version) AS version FROM schema_migrations').get()
  backupVersion = Number(row?.version || 0)
  console.log(`备份 schema version: ${backupVersion}`)
} finally {
  verify.close()
}

const codeVersion = readCodeSchemaVersion()
if (codeVersion > 0 && backupVersion > codeVersion) {
  console.error(`拒绝恢复：备份 schema version ${backupVersion} 高于当前程序支持的 ${codeVersion}。请先升级 SubX。`)
  process.exit(1)
}
if (existsSync(dbPath)) {
  try { currentVersion = readDbSchemaVersion(dbPath) } catch { currentVersion = 0 }
  if (currentVersion > backupVersion && !force) {
    console.error(`拒绝恢复：当前数据库 schema version ${currentVersion} 高于备份 ${backupVersion}，继续会降级数据。`)
    console.error('确认要降级时追加 --force，并先确认已备份当前数据库。')
    process.exit(1)
  }
}

if (existsSync(dbPath)) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const previous = `${dbPath}.pre-restore-${stamp}`
  copyFileSync(dbPath, previous)
  try { chmodSync(previous, 0o600) } catch { /* best effort */ }
  console.log(`当前数据库已备份：${previous}`)
}

copyFileSync(backupDb, dbPath)
try { chmodSync(dbPath, 0o600) } catch { /* best effort */ }
for (const suffix of ['-wal', '-shm']) {
  try { rmSync(`${dbPath}${suffix}`, { force: true }) } catch { /* ignore */ }
}
const secretPath = join(dirname(dbPath), '.secret')
const backupSecret = join(source, '.secret')
if (existsSync(backupSecret)) {
  copyFileSync(backupSecret, secretPath)
  try { chmodSync(secretPath, 0o600) } catch { /* best effort */ }
  console.log('已恢复 .secret')
}
console.log(`恢复完成：${dbPath}`)
console.log('请确保恢复前已停止 SubX，恢复后重新启动应用。')
