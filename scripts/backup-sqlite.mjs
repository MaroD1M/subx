import Database from 'better-sqlite3'
import { cpSync, existsSync, mkdirSync, writeFileSync } from 'fs'
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

if (!existsSync(dbPath)) {
  console.error(`数据库不存在：${dbPath}`)
  process.exit(1)
}

mkdirSync(target, { recursive: true })
const db = new Database(dbPath, { readonly: true })
try {
  await db.backup(join(target, 'subx.db'))
  const row = db.prepare('SELECT MAX(version) AS version FROM schema_migrations').get()
  const version = Number(row?.version || 0)
  const secretPath = join(dirname(dbPath), '.secret')
  const hasSecret = existsSync(secretPath)
  if (hasSecret) cpSync(secretPath, join(target, '.secret'))
  if (includeLogs && existsSync(join(dirname(dbPath), 'logs'))) {
    cpSync(join(dirname(dbPath), 'logs'), join(target, 'logs'), { recursive: true })
  }
  writeFileSync(join(target, 'manifest.json'), JSON.stringify({
    createdAt: new Date().toISOString(),
    schemaVersion: version,
    sourceDb: dbPath,
    includesSecret: hasSecret,
    includesLogs: includeLogs
  }, null, 2), 'utf-8')
  console.log(`备份完成：${target}`)
  console.log(`schema version: ${version}`)
  console.log(`包含 .secret: ${hasSecret ? '是' : '否'}`)
  console.log(`包含任务日志: ${includeLogs ? '是' : '否'}`)
} finally {
  db.close()
}
