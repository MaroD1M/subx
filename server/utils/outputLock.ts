import { closeSync, openSync, readFileSync, statSync, unlinkSync, writeFileSync } from 'fs'

const LOCK_SUFFIX = '.subx-output.lock'
const STALE_MS = 6 * 60 * 60 * 1000

export function acquireOutputLocks(paths: string[]): () => void {
  const unique = Array.from(new Set(paths.filter(Boolean))).sort()
  const acquired: string[] = []
  try {
    for (const target of unique) {
      const lockPath = `${target}${LOCK_SUFFIX}`
      try {
        const fd = openSync(lockPath, 'wx')
        try {
          writeFileSync(fd, JSON.stringify({ pid: process.pid, at: Date.now(), target }))
        } finally {
          closeSync(fd)
        }
        acquired.push(lockPath)
      } catch (error: any) {
        if (error?.code !== 'EEXIST') throw error
        let stale = false
        try {
          stale = Date.now() - statSync(lockPath).mtimeMs > STALE_MS
        } catch {
          stale = false
        }
        if (!stale) {
          throw new Error(`输出文件正在被其他任务写入：${target}`)
        }
        try { unlinkSync(lockPath) } catch { /* ignore stale lock cleanup failure */ }
        const fd = openSync(lockPath, 'wx')
        try {
          writeFileSync(fd, JSON.stringify({ pid: process.pid, at: Date.now(), target }))
        } finally {
          closeSync(fd)
        }
        acquired.push(lockPath)
      }
    }
  } catch (error) {
    for (const lockPath of acquired) {
      try { unlinkSync(lockPath) } catch { /* ignore cleanup failure */ }
    }
    throw error
  }

  return () => {
    for (const lockPath of acquired) {
      try {
        const content = JSON.parse(readFileSync(lockPath, 'utf-8'))
        if (Number(content?.pid) && Number(content.pid) !== process.pid) continue
      } catch { /* remove unreadable lock */ }
      try { unlinkSync(lockPath) } catch { /* ignore cleanup failure */ }
    }
  }
}
