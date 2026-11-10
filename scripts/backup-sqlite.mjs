import Database from 'better-sqlite3'
import { chmodSync, cpSync, existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'fs'
import { dirname, join, resolve } from 'path'

function arg(name, fallback = '') {
  const index = process.argv.indexOf(name)
  return index >= 0 ? String(process.argv[index + 1] || fallback) : fallback
}

const dbPath = resolve(process.env.DB_PATH || 'db/subx.db')
const outRoot = resolve(arg('--out', 'backups'))
const stamp = new Date().toISOString().replace(/[:.]/g, '-')
const target = join(outRoot, `subx-${stamp}`)
const includeLogs = !process.argv.includes('--no-logs')
const includeSecret = !process.argv.includes('--no-secret')
const keep = Math.max(0, Math.floor(Number(arg('--keep', '0')) || 0))

if (!existsSync(dbPath)) {
  console.error(`数据库不存在：${dbPath}`)
  process.exit(1)
}

mkdirSync(target, { recursive: true, mode: 0o700 })
try { chmodSync(target, 0o700) } catch { /* best effort on non-POSIX filesystems */ }
const db = new Database(dbPath, { readonly: true })
try {
  await db.backup(join(target, 'subx.db'))
  try { chmodSync(join(target, 'subx.db'), 0o600) } catch { /* best effort */ }
  const row = db.prepare('SELECT MAX(version) AS version FROM schema_migrations').get()
  const version = Number(row?.version || 0)
  const secretPath = join(dirname(dbPath), '.secret')
  const hasSecret = existsSync(secretPath)
  if (hasSecret && includeSecret) {
    cpSync(secretPath, join(target, '.secret'))
    try { chmodSync(join(target, '.secret'), 0o600) } catch { /* best effort */ }
  }
  if (includeLogs && existsSync(join(dirname(dbPath), 'logs'))) {
    cpSync(join(dirname(dbPath), 'logs'), join(target, 'logs'), { recursive: true })
  }
  const manifestPath = join(target, 'manifest.json')
  writeFileSync(manifestPath, JSON.stringify({
    createdAt: new Date().toISOString(),
    schemaVersion: version,
    sourceDb: dbPath,
    includesSecret: hasSecret && includeSecret,
    includesLogs: includeLogs
  }, null, 2), 'utf-8')
  try { chmodSync(manifestPath, 0o600) } catch { /* best effort */ }
  console.log(`备份完成：${target}`)
  console.log(`schema version: ${version}`)
  console.log(`包含 .secret: ${hasSecret && includeSecret ? '是' : '否'}`)
  if (hasSecret && includeSecret) {
    console.log('提示：备份包含加密密钥 .secret，请妥善保管，不要上传或提交到 Git。')
  }
  console.log(`包含任务日志: ${includeLogs ? '是' : '否'}`)

  if (keep > 0) {
    try {
      const backups = readdirSync(outRoot, { withFileTypes: true })
        .filter(entry => entry.isDirectory() && entry.name.startsWith('subx-'))
        .map(entry => entry.name)
        .sort()
        .reverse()
      for (const name of backups.slice(keep)) {
        rmSync(join(outRoot, name), { recursive: true, force: true })
        console.log(`已清理旧备份：${name}`)
      }
    } catch (error) {
      console.warn(`清理旧备份失败：${error?.message || error}`)
    }
  }
} finally {
  db.close()
}
