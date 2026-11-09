import Database from 'better-sqlite3'
import { copyFileSync, existsSync, readFileSync, renameSync, rmSync } from 'fs'
import { dirname, join, resolve } from 'path'

const source = resolve(String(process.argv[2] || ''))
const dbPath = resolve(process.env.DB_PATH || 'db/subx.db')

if (!source || !existsSync(join(source, 'subx.db'))) {
  console.error('用法：node scripts/restore-sqlite.mjs <备份目录>')
  process.exit(1)
}

const backupDb = join(source, 'subx.db')
const verify = new Database(backupDb, { readonly: true })
try {
  const integrity = verify.pragma('integrity_check', { simple: true })
  if (String(integrity) !== 'ok') throw new Error(`备份数据库完整性检查失败：${integrity}`)
  const row = verify.prepare('SELECT MAX(version) AS version FROM schema_migrations').get()
  console.log(`备份 schema version: ${Number(row?.version || 0)}`)
} finally {
  verify.close()
}

if (existsSync(dbPath)) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const previous = `${dbPath}.pre-restore-${stamp}`
  copyFileSync(dbPath, previous)
  console.log(`当前数据库已备份：${previous}`)
}

copyFileSync(backupDb, dbPath)
for (const suffix of ['-wal', '-shm']) {
  try { rmSync(`${dbPath}${suffix}`, { force: true }) } catch { /* ignore */ }
}
const secretPath = join(dirname(dbPath), '.secret')
const backupSecret = join(source, '.secret')
if (existsSync(backupSecret)) {
  copyFileSync(backupSecret, secretPath)
  console.log('已恢复 .secret')
}
console.log(`恢复完成：${dbPath}`)
console.log('请确保恢复前已停止 SubX，恢复后重新启动应用。')
